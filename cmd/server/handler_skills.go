package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"game/internal/character"

	"github.com/jackc/pgx/v5"
)

// ── Shared types ──────────────────────────────────────────────────────────────

type skillNodeDef struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	RequiresID *string `json:"requires_id"`
	Col        int     `json:"col"`
	Row        int     `json:"row"`
}

type skillStateResponse struct {
	Nodes           []skillNodeDef `json:"nodes"`
	Unlocked        []string       `json:"unlocked"`
	EquippedSkill   string         `json:"equipped_skill"`
	AvailablePoints int            `json:"available_points"`
}

// ── GET /characters/{id}/skills ───────────────────────────────────────────────

func (s *server) handleGetSkills(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	// Load unlocked nodes
	rows, err := s.pool.Query(r.Context(), `
		SELECT node_id FROM character_skill_nodes
		WHERE character_id = $1
	`, charID)
	if err != nil {
		log.Printf("get skills: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch skills")
		return
	}
	defer rows.Close()

	var unlocked []string
	for rows.Next() {
		var nodeID string
		if err := rows.Scan(&nodeID); err != nil {
			log.Printf("scan skill node: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch skills")
			return
		}
		unlocked = append(unlocked, nodeID)
	}
	if err := rows.Err(); err != nil {
		log.Printf("skill rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch skills")
		return
	}
	if unlocked == nil {
		unlocked = []string{}
	}

	// Load equipped skill and level
	var equippedSkill, charClass string
	var level int
	err = s.pool.QueryRow(r.Context(), `
		SELECT equipped_skill, level, class FROM characters WHERE id = $1
	`, charID).Scan(&equippedSkill, &level, &charClass)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("get skills char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}

	nodeRows, err := s.pool.Query(r.Context(), `
		SELECT id, name, type, requires_id, col, row
		FROM skill_nodes
		WHERE class_restriction = $1
		ORDER BY row, col
	`, charClass)
	if err != nil {
		log.Printf("get skill nodes: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch skill nodes")
		return
	}
	defer nodeRows.Close()

	var nodes []skillNodeDef
	for nodeRows.Next() {
		var n skillNodeDef
		if err := nodeRows.Scan(&n.ID, &n.Name, &n.Type, &n.RequiresID, &n.Col, &n.Row); err != nil {
			log.Printf("scan skill node: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch skill nodes")
			return
		}
		nodes = append(nodes, n)
	}
	if err := nodeRows.Err(); err != nil {
		log.Printf("skill node rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch skill nodes")
		return
	}
	if nodes == nil {
		nodes = []skillNodeDef{}
	}

	writeJSON(w, http.StatusOK, skillStateResponse{
		Nodes:           nodes,
		Unlocked:        unlocked,
		EquippedSkill:   equippedSkill,
		AvailablePoints: character.SkillPointsAvailable(level, len(unlocked)),
	})
}

// ── POST /characters/{id}/skills/{nodeId}/unlock ──────────────────────────────

func (s *server) handleUnlockSkill(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")
	nodeID := r.PathValue("nodeId")

	// Load node definition
	var nodeType string
	var requiresID *string
	err := s.pool.QueryRow(r.Context(), `
		SELECT type, requires_id FROM skill_nodes WHERE id = $1
	`, nodeID).Scan(&nodeType, &requiresID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "skill node not found")
		return
	}
	if err != nil {
		log.Printf("unlock skill load node: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load node")
		return
	}

	// Check prerequisite
	if requiresID != nil {
		var prereqUnlocked bool
		err = s.pool.QueryRow(r.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM character_skill_nodes
				WHERE character_id = $1 AND node_id = $2
			)
		`, charID, *requiresID).Scan(&prereqUnlocked)
		if err != nil {
			log.Printf("unlock skill check prereq: %v", err)
			writeError(w, http.StatusInternalServerError, "could not check prerequisite")
			return
		}
		if !prereqUnlocked {
			writeError(w, http.StatusBadRequest, "prerequisite node not unlocked")
			return
		}
	}

	// Check already unlocked
	var alreadyUnlocked bool
	err = s.pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM character_skill_nodes
			WHERE character_id = $1 AND node_id = $2
		)
	`, charID, nodeID).Scan(&alreadyUnlocked)
	if err != nil {
		log.Printf("unlock skill check existing: %v", err)
		writeError(w, http.StatusInternalServerError, "could not check existing")
		return
	}
	if alreadyUnlocked {
		writeError(w, http.StatusBadRequest, "node already unlocked")
		return
	}

	// Check available points
	var level, unlockedCount int
	err = s.pool.QueryRow(r.Context(), `
		SELECT c.level, COUNT(csn.node_id)
		FROM characters c
		LEFT JOIN character_skill_nodes csn ON csn.character_id = c.id
		WHERE c.id = $1
		GROUP BY c.level
	`, charID).Scan(&level, &unlockedCount)
	if err != nil {
		log.Printf("unlock skill check points: %v", err)
		writeError(w, http.StatusInternalServerError, "could not check points")
		return
	}
	if character.SkillPointsAvailable(level, unlockedCount) < 1 {
		writeError(w, http.StatusBadRequest, "no skill points available")
		return
	}

	// Unlock
	_, err = s.pool.Exec(r.Context(), `
		INSERT INTO character_skill_nodes (character_id, node_id)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, charID, nodeID)
	if err != nil {
		log.Printf("unlock skill insert: %v", err)
		writeError(w, http.StatusInternalServerError, "could not unlock skill")
		return
	}

	// Return updated skill state
	s.handleGetSkills(w, r)
}

// ── PUT /characters/{id}/skills/equipped ──────────────────────────────────────

type equipSkillRequest struct {
	NodeID string `json:"node_id"`
}

func (s *server) handleEquipSkill(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	var req equipSkillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NodeID == "" {
		writeError(w, http.StatusBadRequest, "node_id required")
		return
	}

	// Verify node is active type
	var nodeType string
	err := s.pool.QueryRow(r.Context(), `
		SELECT type FROM skill_nodes WHERE id = $1
	`, req.NodeID).Scan(&nodeType)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "skill node not found")
		return
	}
	if err != nil {
		log.Printf("equip skill load node: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load node")
		return
	}
	if nodeType != "active" {
		writeError(w, http.StatusBadRequest, "only active nodes can be equipped")
		return
	}

	// Verify character has unlocked this node
	var unlocked bool
	err = s.pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM character_skill_nodes
			WHERE character_id = $1 AND node_id = $2
		)
	`, charID, req.NodeID).Scan(&unlocked)
	if err != nil {
		log.Printf("equip skill check unlock: %v", err)
		writeError(w, http.StatusInternalServerError, "could not verify unlock")
		return
	}
	if !unlocked {
		writeError(w, http.StatusBadRequest, "node not unlocked")
		return
	}

	// Update
	_, err = s.pool.Exec(r.Context(), `
		UPDATE characters SET equipped_skill = $1 WHERE id = $2
	`, req.NodeID, charID)
	if err != nil {
		log.Printf("equip skill update: %v", err)
		writeError(w, http.StatusInternalServerError, "could not equip skill")
		return
	}

	s.handleGetSkills(w, r)
}
