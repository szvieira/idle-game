package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"game/internal/raid"

	"github.com/jackc/pgx/v5"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

type startRaidRequest struct {
	LobbyID     string `json:"lobby_id"`
	CharacterID string `json:"character_id"`
}

func (s *server) handleStartRaid(w http.ResponseWriter, r *http.Request) {
	var req startRaidRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "lobby_id or character_id required")
		return
	}
	if req.LobbyID == "" && req.CharacterID == "" {
		writeError(w, http.StatusBadRequest, "lobby_id or character_id required")
		return
	}

	lobbyID := req.LobbyID
	if lobbyID == "" {
		var err error
		lobbyID, err = s.createSoloRaidLobby(r.Context(), req.CharacterID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "character not found")
			return
		}
		if err != nil {
			log.Printf("create raid lobby: %v", err)
			writeError(w, http.StatusInternalServerError, "could not create raid lobby")
			return
		}
	}

	var runID string
	err := s.pool.QueryRow(r.Context(), `
		INSERT INTO raid_runs (lobby_id, status)
		VALUES ($1, 'running')
		RETURNING id
	`, lobbyID).Scan(&runID)
	if err != nil {
		log.Printf("start raid: %v", err)
		writeError(w, http.StatusInternalServerError, "could not start raid")
		return
	}

	eng := raid.NewEngine(runID)
	eng.SpawnBoss()

	s.raidsMu.Lock()
	s.raids[runID] = eng
	s.raidsMu.Unlock()

	go eng.Run(context.Background())

	writeJSON(w, http.StatusCreated, map[string]string{"run_id": runID})
}

func (s *server) createSoloRaidLobby(ctx context.Context, charID string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var class string
	if err := tx.QueryRow(ctx, `SELECT class FROM characters WHERE id = $1`, charID).Scan(&class); err != nil {
		return "", err
	}

	var lobbyID string
	inviteCode := fmt.Sprintf("solo-%d", time.Now().UnixNano())
	if err := tx.QueryRow(ctx, `
		INSERT INTO raid_lobbies (raid_definition_id, leader_character_id, invite_code, status)
		VALUES ('forsaken_warlord', $1, $2, 'started')
		RETURNING id
	`, charID, inviteCode).Scan(&lobbyID); err != nil {
		return "", err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO raid_lobby_members (lobby_id, character_id, class)
		VALUES ($1, $2, $3)
	`, lobbyID, charID, class); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return lobbyID, nil
}

func (s *server) handleRaidWS(w http.ResponseWriter, r *http.Request) {
	runID := r.URL.Query().Get("run_id")
	charID := r.URL.Query().Get("char_id")
	if runID == "" || charID == "" {
		writeError(w, http.StatusBadRequest, "run_id and char_id required")
		return
	}

	s.raidsMu.Lock()
	eng, ok := s.raids[runID]
	s.raidsMu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "raid run not found")
		return
	}

	sc, err := s.loadCharEffective(r.Context(), charID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("raid ws load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("raid ws accept: %v", err)
		return
	}

	eng.AddPlayer(charID, sc.name, sc.c.MaxHP, sc.c.Attack, sc.c.Defense, conn)
	sendCh := eng.SendChan(charID)
	if sendCh == nil {
		conn.Close(websocket.StatusInternalError, "raid player not registered")
		return
	}

	ctx := r.Context()
	go func() {
		for {
			select {
			case msg, ok := <-sendCh:
				if !ok {
					conn.Close(websocket.StatusNormalClosure, "")
					return
				}
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		var msg raid.InputMsg
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			break
		}
		msg.CharID = charID
		eng.HandleInput(charID, msg)
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
