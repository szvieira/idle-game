package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"

	"game/internal/db"
	"game/internal/presence"
	"game/internal/raid"

	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	pool    *pgxpool.Pool
	hub     *presence.Hub
	raidsMu sync.Mutex
	raids   map[string]*raid.Engine
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /accounts", s.handleCreateAccount)
	mux.HandleFunc("POST /characters", s.handleCreateCharacter)
	mux.HandleFunc("GET /characters/{id}", s.handleGetCharacter)
	mux.HandleFunc("POST /dungeon-runs", s.handleCreateDungeonRun)
	mux.HandleFunc("GET /dungeon-runs/{id}", s.handleGetDungeonRun)
	mux.HandleFunc("POST /dungeon-runs/{id}/claim", s.handleClaimDungeonRun)
	mux.HandleFunc("POST /expedition-runs", s.handleStartExpedition)
	mux.HandleFunc("GET /expedition-runs/{id}", s.handleGetExpedition)
	mux.HandleFunc("POST /expedition-runs/{id}/collect", s.handleCollectExpedition)
	mux.HandleFunc("POST /expedition-runs/{id}/pause", s.handlePauseExpedition)
	mux.HandleFunc("POST /expedition-runs/{id}/resume", s.handleResumeExpedition)
	mux.HandleFunc("POST /expedition-runs/{id}/zone", s.handleSwitchZone)
	mux.HandleFunc("POST /expedition-runs/{id}/complete", s.handleCompleteExpedition)
	mux.HandleFunc("POST /dungeon-complete", s.handleCompleteDungeon)
	mux.HandleFunc("GET /characters/{id}/inventory", s.handleGetInventory)
	mux.HandleFunc("GET /characters/{id}/equipped", s.handleGetEquipped)
	mux.HandleFunc("POST /characters/{id}/equipment/{slot}", s.handleEquip)
	mux.HandleFunc("DELETE /characters/{id}/equipment/{slot}", s.handleUnequip)
	mux.HandleFunc("GET /characters/{id}/skills", s.handleGetSkills)
	mux.HandleFunc("POST /characters/{id}/skills/{nodeId}/unlock", s.handleUnlockSkill)
	mux.HandleFunc("PUT /characters/{id}/skills/equipped", s.handleEquipSkill)
	mux.HandleFunc("GET /ws/presence", s.handlePresence)
	mux.HandleFunc("POST /raid-lobbies", s.handleCreateRaidLobby)
	mux.HandleFunc("POST /raid-lobbies/join", s.handleJoinRaidLobby)
	mux.HandleFunc("GET /raid-lobbies/{id}", s.handleGetRaidLobby)
	mux.HandleFunc("POST /raid-runs", s.handleStartRaid)
	mux.HandleFunc("GET /ws/raid", s.handleRaidWS)
	return cors(mux)
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://game:game@localhost:5432/game?sslmode=disable"
	}
	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	ctx := context.Background()

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	s := &server{pool: pool, hub: presence.NewHub(), raids: make(map[string]*raid.Engine)}
	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, s.routes()); err != nil {
		log.Fatal(err)
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.pool.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "db unreachable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
