package main

import (
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"time"

	"game/internal/character"
	"game/internal/combat"
	"game/internal/dungeon"

	"github.com/jackc/pgx/v5"
)

// ── Payload types (stored as JSONB in dungeon_rewards) ────────────────────────

type rewardItem struct {
	TemplateID string `json:"template_id"`
	Name       string `json:"name"`
	Rarity     string `json:"rarity"`
	Slot       string `json:"slot"`
}

type rewardPayload struct {
	XP    int          `json:"xp"`
	Gold  int          `json:"gold"`
	Items []rewardItem `json:"items"`
}

// ── POST /dungeon-runs ────────────────────────────────────────────────────────

type createDungeonRunRequest struct {
	DungeonDefinitionID string   `json:"dungeon_definition_id"`
	Participants        []string `json:"participants"`
}

type createDungeonRunResponse struct {
	RunID             string `json:"run_id"`
	Status            string `json:"status"`
	DungeonName       string `json:"dungeon_name"`
	RoomsCleared      int    `json:"rooms_cleared"`
	Outcome           string `json:"outcome"`
	RewardsAvailable  bool   `json:"rewards_available"`
}

func (s *server) handleCreateDungeonRun(w http.ResponseWriter, r *http.Request) {
	var req createDungeonRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.DungeonDefinitionID == "" || len(req.Participants) == 0 {
		writeError(w, http.StatusBadRequest, "dungeon_definition_id and participants required")
		return
	}

	// Validate dungeon definition
	var dungeonName string
	var minLevel int
	err := s.pool.QueryRow(r.Context(),
		`SELECT name, min_level FROM dungeon_definitions WHERE id = $1`,
		req.DungeonDefinitionID,
	).Scan(&dungeonName, &minLevel)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "dungeon not found")
		return
	}
	if err != nil {
		log.Printf("load dungeon definition: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load dungeon")
		return
	}

	// Load participants (MVP: single character)
	charID := req.Participants[0]
	sc, err := s.loadChar(r.Context(), charID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("load character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}
	if sc.c.Level < minLevel {
		writeError(w, http.StatusBadRequest, "character level too low for this dungeon")
		return
	}

	// Run dungeon server-side
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	rooms := dungeon.BuildDungeon()
	h := combat.NopHandler{}
	lvlH := character.NopLevelUpHandler{}

	var roomsCleared int
	outcome := "defeat"
	ds := &dungeon.DungeonStats{StartTime: time.Now()}
	var rolledItems []*dungeon.Item

	for _, room := range rooms {
		rs := dungeon.RoomStats{
			Name:       room.Name,
			XPGained:   room.XP,
			GoldEarned: room.Gold,
		}
		survived := true
		for _, e := range room.Enemies {
			if !combat.RunCombat(sc.c, e, &rs.Combat, room.IsBoss, rng, h) {
				survived = false
				break
			}
		}
		if !survived {
			break
		}
		sc.c.XP += room.XP
		sc.gold += room.Gold
		character.CheckLevelUp(sc.c, lvlH)
		if item := dungeon.RollItem(rng, room.IsElite, room.IsBoss); item != nil {
			rolledItems = append(rolledItems, item)
		}
		ds.Rooms = append(ds.Rooms, rs)
		roomsCleared++
	}
	if roomsCleared == len(rooms) {
		outcome = "victory"
	}
	_, _, _, _, totalXP, totalGold := ds.Totals()

	// Resolve item template IDs from names
	var payloadItems []rewardItem
	for _, item := range rolledItems {
		var templateID string
		if err := s.pool.QueryRow(r.Context(),
			`SELECT id FROM item_templates WHERE name = $1`, item.Name,
		).Scan(&templateID); err != nil {
			continue
		}
		payloadItems = append(payloadItems, rewardItem{
			TemplateID: templateID,
			Name:       item.Name,
			Rarity:     item.Rarity,
			Slot:       item.Slot,
		})
	}

	payload := rewardPayload{XP: totalXP, Gold: totalGold, Items: payloadItems}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not encode rewards")
		return
	}

	// Persist in one transaction
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var runID string
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO dungeon_runs (dungeon_definition_id, status, finished_at, rooms_cleared, outcome)
		VALUES ($1, 'completed', NOW(), $2, $3)
		RETURNING id
	`, req.DungeonDefinitionID, roomsCleared, outcome).Scan(&runID); err != nil {
		log.Printf("insert dungeon_run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save run")
		return
	}

	if _, err := tx.Exec(r.Context(),
		`INSERT INTO dungeon_participants (run_id, character_id) VALUES ($1, $2)`,
		runID, charID,
	); err != nil {
		log.Printf("insert participant: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save participant")
		return
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO dungeon_rewards (run_id, character_id, payload)
		VALUES ($1, $2, $3)
	`, runID, charID, payloadJSON); err != nil {
		log.Printf("insert rewards: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save rewards")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit")
		return
	}

	writeJSON(w, http.StatusCreated, createDungeonRunResponse{
		RunID:            runID,
		Status:           "completed",
		DungeonName:      dungeonName,
		RoomsCleared:     roomsCleared,
		Outcome:          outcome,
		RewardsAvailable: true,
	})
}

// ── GET /dungeon-runs/{id} ────────────────────────────────────────────────────

type dungeonParticipantInfo struct {
	CharacterID string `json:"character_id"`
	Claimed     bool   `json:"claimed"`
}

type getDungeonRunResponse struct {
	ID           string                   `json:"id"`
	DungeonName  string                   `json:"dungeon_name"`
	Status       string                   `json:"status"`
	Outcome      *string                  `json:"outcome"`
	RoomsCleared int                      `json:"rooms_cleared"`
	StartedAt    time.Time                `json:"started_at"`
	FinishedAt   *time.Time               `json:"finished_at"`
	Participants []dungeonParticipantInfo `json:"participants"`
}

func (s *server) handleGetDungeonRun(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("id")

	var resp getDungeonRunResponse
	err := s.pool.QueryRow(r.Context(), `
		SELECT dr.id, dd.name, dr.status, dr.outcome, dr.rooms_cleared, dr.started_at, dr.finished_at
		FROM dungeon_runs dr
		JOIN dungeon_definitions dd ON dd.id = dr.dungeon_definition_id
		WHERE dr.id = $1
	`, runID).Scan(&resp.ID, &resp.DungeonName, &resp.Status, &resp.Outcome, &resp.RoomsCleared, &resp.StartedAt, &resp.FinishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "run not found")
		return
	}
	if err != nil {
		log.Printf("get dungeon run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch run")
		return
	}

	rows, err := s.pool.Query(r.Context(), `
		SELECT dp.character_id, COALESCE(dr.claimed, false)
		FROM dungeon_participants dp
		LEFT JOIN dungeon_rewards dr ON dr.run_id = dp.run_id AND dr.character_id = dp.character_id
		WHERE dp.run_id = $1
	`, runID)
	if err != nil {
		log.Printf("get participants: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch participants")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var p dungeonParticipantInfo
		if err := rows.Scan(&p.CharacterID, &p.Claimed); err != nil {
			continue
		}
		resp.Participants = append(resp.Participants, p)
	}

	writeJSON(w, http.StatusOK, resp)
}

// ── POST /dungeon-runs/{id}/claim ─────────────────────────────────────────────

type claimDungeonRunRequest struct {
	CharacterID string `json:"character_id"`
}

type lootEntry struct {
	InventoryItemID string `json:"inventory_item_id"`
	Name            string `json:"name"`
	Rarity          string `json:"rarity"`
	Slot            string `json:"slot"`
}

type claimDungeonRunResponse struct {
	Success   bool              `json:"success"`
	Character characterResponse `json:"character"`
	Loot      []lootEntry       `json:"loot"`
}

func (s *server) handleClaimDungeonRun(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("id")

	var req claimDungeonRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.CharacterID == "" {
		writeError(w, http.StatusBadRequest, "character_id required")
		return
	}

	// Verify run is completed
	var status string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT status FROM dungeon_runs WHERE id = $1`, runID,
	).Scan(&status); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "run not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not fetch run")
		return
	}
	if status != "completed" {
		writeError(w, http.StatusBadRequest, "run not completed")
		return
	}

	// Load reward row (also verifies participant + not yet claimed)
	var rewardID string
	var payloadJSON []byte
	var claimed bool
	err := s.pool.QueryRow(r.Context(), `
		SELECT id, payload, claimed FROM dungeon_rewards
		WHERE run_id = $1 AND character_id = $2
	`, runID, req.CharacterID).Scan(&rewardID, &payloadJSON, &claimed)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "no reward for this character in this run")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not fetch reward")
		return
	}
	if claimed {
		writeError(w, http.StatusConflict, "rewards already claimed")
		return
	}

	var payload rewardPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		writeError(w, http.StatusInternalServerError, "corrupt reward payload")
		return
	}

	// Load current character state
	sc, err := s.loadChar(r.Context(), req.CharacterID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	// Apply rewards to character state
	sc.c.XP += payload.XP
	sc.gold += payload.Gold
	character.CheckLevelUp(sc.c, character.NopLevelUpHandler{})

	// Persist in one transaction
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `
		UPDATE characters
		SET xp = $1, xp_to_next = $2, gold = $3, level = $4,
		    hp = $5, max_hp = $6, attack = $7, updated_at = NOW()
		WHERE id = $8
	`, sc.c.XP, sc.c.XPToNext, sc.gold, sc.c.Level,
		sc.c.HP, sc.c.MaxHP, sc.c.Attack, req.CharacterID,
	); err != nil {
		log.Printf("update character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not update character")
		return
	}

	var loot []lootEntry
	for _, item := range payload.Items {
		var invID string
		if err := tx.QueryRow(r.Context(), `
			INSERT INTO inventory_items (character_id, item_template_id)
			VALUES ($1, $2)
			RETURNING id
		`, req.CharacterID, item.TemplateID).Scan(&invID); err != nil {
			log.Printf("insert inventory item: %v", err)
			continue
		}
		loot = append(loot, lootEntry{
			InventoryItemID: invID,
			Name:            item.Name,
			Rarity:          item.Rarity,
			Slot:            item.Slot,
		})
	}

	if _, err := tx.Exec(r.Context(),
		`UPDATE dungeon_rewards SET claimed = true WHERE id = $1`, rewardID,
	); err != nil {
		log.Printf("mark claimed: %v", err)
		writeError(w, http.StatusInternalServerError, "could not mark claimed")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit")
		return
	}

	if loot == nil {
		loot = []lootEntry{}
	}
	writeJSON(w, http.StatusOK, claimDungeonRunResponse{
		Success:   true,
		Character: sc.toResponse(),
		Loot:      loot,
	})
}
