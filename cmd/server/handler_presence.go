package main

import (
	"errors"
	"log"
	"net/http"

	"game/internal/presence"

	"github.com/jackc/pgx/v5"
	"nhooyr.io/websocket"
)

func (s *server) handlePresence(w http.ResponseWriter, r *http.Request) {
	charID := r.URL.Query().Get("char_id")
	if charID == "" {
		writeError(w, http.StatusBadRequest, "char_id required")
		return
	}

	var name string
	err := s.pool.QueryRow(r.Context(), `SELECT name FROM characters WHERE id = $1`, charID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("presence load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}

	client := presence.NewClient(charID, name, s.hub, conn)
	s.hub.Register(client)
	client.Run(r.Context())
}
