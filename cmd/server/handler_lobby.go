package main

import (
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"

	"github.com/jackc/pgx/v5"
)

const inviteChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateInviteCode() string {
	b := make([]byte, 9)
	for i := range b {
		if i == 4 {
			b[i] = '-'
		} else {
			b[i] = inviteChars[rand.Intn(len(inviteChars))]
		}
	}
	return string(b)
}

type createLobbyRequest struct {
	CharacterID string `json:"character_id"`
}

func (s *server) handleCreateRaidLobby(w http.ResponseWriter, r *http.Request) {
	var req createLobbyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CharacterID == "" {
		writeError(w, http.StatusBadRequest, "character_id required")
		return
	}

	var class string
	err := s.pool.QueryRow(r.Context(), `SELECT class FROM characters WHERE id = $1`, req.CharacterID).Scan(&class)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("create lobby load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	code := generateInviteCode()

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context())

	var lobbyID string
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO raid_lobbies (raid_definition_id, leader_character_id, invite_code, status)
		VALUES ('forsaken_warlord', $1, $2, 'waiting')
		RETURNING id
	`, req.CharacterID, code).Scan(&lobbyID); err != nil {
		log.Printf("create lobby insert: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create lobby")
		return
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO raid_lobby_members (lobby_id, character_id, class)
		VALUES ($1, $2, $3)
	`, lobbyID, req.CharacterID, class); err != nil {
		log.Printf("create lobby add leader: %v", err)
		writeError(w, http.StatusInternalServerError, "could not add member")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"lobby_id":    lobbyID,
		"invite_code": code,
	})
}

type joinLobbyRequest struct {
	InviteCode  string `json:"invite_code"`
	CharacterID string `json:"character_id"`
}

func (s *server) handleJoinRaidLobby(w http.ResponseWriter, r *http.Request) {
	var req joinLobbyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.InviteCode == "" || req.CharacterID == "" {
		writeError(w, http.StatusBadRequest, "invite_code and character_id required")
		return
	}

	var class string
	err := s.pool.QueryRow(r.Context(), `SELECT class FROM characters WHERE id = $1`, req.CharacterID).Scan(&class)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context())

	var lobbyID string
	var maxPlayers, currentCount int
	err = tx.QueryRow(r.Context(), `
		SELECT rl.id, rd.max_players,
		       (SELECT COUNT(*) FROM raid_lobby_members WHERE lobby_id = rl.id)
		FROM raid_lobbies rl
		JOIN raid_definitions rd ON rd.id = rl.raid_definition_id
		WHERE rl.invite_code = $1 AND rl.status = 'waiting'
		FOR UPDATE OF rl
	`, req.InviteCode).Scan(&lobbyID, &maxPlayers, &currentCount)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "lobby not found or already started")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if currentCount >= maxPlayers {
		writeError(w, http.StatusConflict, "lobby is full")
		return
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO raid_lobby_members (lobby_id, character_id, class)
		VALUES ($1, $2, $3)
		ON CONFLICT (lobby_id, character_id) DO NOTHING
	`, lobbyID, req.CharacterID, class); err != nil {
		writeError(w, http.StatusInternalServerError, "could not join lobby")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"lobby_id": lobbyID})
}

type lobbyMemberResp struct {
	CharacterID string `json:"character_id"`
	Name        string `json:"name"`
	Class       string `json:"class"`
	IsLeader    bool   `json:"is_leader"`
}

type lobbyStateResp struct {
	ID                string            `json:"id"`
	InviteCode        string            `json:"invite_code"`
	Status            string            `json:"status"`
	LeaderCharacterID string            `json:"leader_character_id"`
	RunID             *string           `json:"run_id,omitempty"`
	Members           []lobbyMemberResp `json:"members"`
}

func (s *server) handleGetRaidLobby(w http.ResponseWriter, r *http.Request) {
	lobbyID := r.PathValue("id")

	var resp lobbyStateResp
	var runID *string
	err := s.pool.QueryRow(r.Context(), `
		SELECT rl.id, rl.invite_code, rl.status, rl.leader_character_id::text,
		       (SELECT rr.id::text FROM raid_runs rr WHERE rr.lobby_id = rl.id ORDER BY rr.started_at DESC LIMIT 1)
		FROM raid_lobbies rl
		WHERE rl.id = $1
	`, lobbyID).Scan(&resp.ID, &resp.InviteCode, &resp.Status, &resp.LeaderCharacterID, &runID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "lobby not found")
		return
	}
	if err != nil {
		log.Printf("get lobby: %v", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	resp.RunID = runID

	rows, err := s.pool.Query(r.Context(), `
		SELECT m.character_id::text, c.name, m.class
		FROM raid_lobby_members m
		JOIN characters c ON c.id = m.character_id
		WHERE m.lobby_id = $1
		ORDER BY m.joined_at
	`, lobbyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	resp.Members = make([]lobbyMemberResp, 0)
	for rows.Next() {
		var m lobbyMemberResp
		if err := rows.Scan(&m.CharacterID, &m.Name, &m.Class); err != nil {
			continue
		}
		m.IsLeader = m.CharacterID == resp.LeaderCharacterID
		resp.Members = append(resp.Members, m)
	}

	writeJSON(w, http.StatusOK, resp)
}
