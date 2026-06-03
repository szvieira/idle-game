package main

import (
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"time"

	"game/internal/expedition"

	"github.com/jackc/pgx/v5"
)

// ── Shared types ──────────────────────────────────────────────────────────────

type expeditionRun struct {
	id                 string
	characterID        string
	zoneID             string
	status             string
	startedAt          time.Time
	lastActivityAt     time.Time
	accumulatedSeconds int64
}

type expeditionRunResponse struct {
	ID             string    `json:"id"`
	CharacterID    string    `json:"character_id"`
	ZoneID         string    `json:"zone_id"`
	ZoneName       string    `json:"zone_name"`
	Status         string    `json:"status"`
	StartedAt      time.Time `json:"started_at"`
	ElapsedSeconds int64     `json:"elapsed_seconds"`
}

type collectExpeditionResponse struct {
	CannotSurvive  bool              `json:"cannot_survive"`
	XPGained       int               `json:"xp_gained"`
	GoldGained     int               `json:"gold_gained"`
	LevelsGained   int               `json:"levels_gained"`
	ElapsedSeconds int64             `json:"elapsed_seconds"`
	Character      characterResponse `json:"character"`
	Loot           []lootEntry       `json:"loot"`
}

type switchZoneResponse struct {
	ZoneID   string                    `json:"zone_id"`
	ZoneName string                    `json:"zone_name"`
	Collect  collectExpeditionResponse `json:"collect"`
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (s *server) loadExpeditionRun(r *http.Request, runID string) (*expeditionRun, error) {
	var run expeditionRun
	err := s.pool.QueryRow(r.Context(), `
		SELECT id, character_id, zone_id, status, started_at, last_activity_at, accumulated_seconds
		FROM expedition_runs WHERE id = $1
	`, runID).Scan(
		&run.id, &run.characterID, &run.zoneID, &run.status,
		&run.startedAt, &run.lastActivityAt, &run.accumulatedSeconds,
	)
	if err != nil {
		return nil, err
	}
	return &run, nil
}

func elapsedSeconds(run *expeditionRun) int64 {
	elapsed := run.accumulatedSeconds
	if run.status == "active" {
		elapsed += int64(time.Since(run.lastActivityAt).Seconds())
	}
	return elapsed
}

func buildCharResp(sc *serverChar, result expedition.CollectResult) characterResponse {
	return characterResponse{
		ID:       sc.id,
		Name:     sc.name,
		Class:    sc.c.Class,
		Level:    result.NewLevel,
		XP:       result.NewXP,
		XPToNext: result.NewXPToNext,
		Gold:     result.NewGold,
		HP:       result.NewHP,
		MaxHP:    result.NewMaxHP,
		Mana:     sc.c.Mana,
		MaxMana:  sc.c.MaxMana,
		Attack:   result.NewAttack,
		Defense:  sc.c.Defense,
		Critical: sc.c.Critical,
		CDR:      sc.c.CDR,
	}
}

// persistCollect writes collect results to DB in a single transaction.
// Pass newZoneID to also update the expedition's zone (for zone switch).
func (s *server) persistCollect(r *http.Request, charID, runID, newZoneID string, result expedition.CollectResult) ([]lootEntry, error) {
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `
		UPDATE characters
		SET xp = $1, xp_to_next = $2, level = $3,
		    hp = $4, max_hp = $5, attack = $6, gold = $7,
		    updated_at = NOW()
		WHERE id = $8
	`, result.NewXP, result.NewXPToNext, result.NewLevel,
		result.NewHP, result.NewMaxHP, result.NewAttack, result.NewGold,
		charID,
	); err != nil {
		return nil, err
	}

	var loot []lootEntry
	for _, item := range result.Items {
		var templateID string
		if err := tx.QueryRow(r.Context(),
			`SELECT id FROM item_templates WHERE name = $1`, item.Name,
		).Scan(&templateID); err != nil {
			continue
		}
		var invID string
		if err := tx.QueryRow(r.Context(),
			`INSERT INTO inventory_items (character_id, item_template_id) VALUES ($1, $2) RETURNING id`,
			charID, templateID,
		).Scan(&invID); err != nil {
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

	if newZoneID != "" {
		_, err = tx.Exec(r.Context(), `
			UPDATE expedition_runs
			SET accumulated_seconds = 0, last_activity_at = NOW(), zone_id = $1, status = 'active'
			WHERE id = $2
		`, newZoneID, runID)
	} else {
		_, err = tx.Exec(r.Context(), `
			UPDATE expedition_runs
			SET accumulated_seconds = 0, last_activity_at = NOW()
			WHERE id = $1
		`, runID)
	}
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(r.Context()); err != nil {
		return nil, err
	}

	if loot == nil {
		loot = []lootEntry{}
	}
	return loot, nil
}

func runToResponse(run *expeditionRun, zoneName string) expeditionRunResponse {
	return expeditionRunResponse{
		ID:             run.id,
		CharacterID:    run.characterID,
		ZoneID:         run.zoneID,
		ZoneName:       zoneName,
		Status:         run.status,
		StartedAt:      run.startedAt,
		ElapsedSeconds: elapsedSeconds(run),
	}
}

// ── POST /expedition-runs ─────────────────────────────────────────────────────

type startExpeditionRequest struct {
	CharacterID string `json:"character_id"`
	ZoneID      string `json:"zone_id"`
}

func (s *server) handleStartExpedition(w http.ResponseWriter, r *http.Request) {
	var req startExpeditionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.CharacterID == "" || req.ZoneID == "" {
		writeError(w, http.StatusBadRequest, "character_id and zone_id required")
		return
	}

	zone := expedition.GetZone(req.ZoneID)
	if zone == nil {
		writeError(w, http.StatusBadRequest, "unknown zone")
		return
	}

	sc, err := s.loadChar(r.Context(), req.CharacterID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("load character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}
	if sc.c.Level < zone.MinLevel {
		writeError(w, http.StatusBadRequest, "character level too low for this zone")
		return
	}

	var runID string
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO expedition_runs (character_id, zone_id)
		VALUES ($1, $2)
		ON CONFLICT (character_id) DO UPDATE SET zone_id = expedition_runs.zone_id
		RETURNING id
	`, req.CharacterID, req.ZoneID).Scan(&runID)
	if err != nil {
		log.Printf("insert expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not start expedition")
		return
	}

	run, err := s.loadExpeditionRun(r, runID)
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}

	// Run may already exist with a different zone; use the actual run's zone name
	actualZoneName := run.zoneID
	if z := expedition.GetZone(run.zoneID); z != nil {
		actualZoneName = z.Name
	}
	writeJSON(w, http.StatusCreated, runToResponse(run, actualZoneName))
}

// ── GET /expedition-runs/{id} ─────────────────────────────────────────────────

func (s *server) handleGetExpedition(w http.ResponseWriter, r *http.Request) {
	run, err := s.loadExpeditionRun(r, r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found")
		return
	}
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}

	zoneName := run.zoneID
	if z := expedition.GetZone(run.zoneID); z != nil {
		zoneName = z.Name
	}

	writeJSON(w, http.StatusOK, runToResponse(run, zoneName))
}

// ── POST /expedition-runs/{id}/collect ───────────────────────────────────────

func (s *server) handleCollectExpedition(w http.ResponseWriter, r *http.Request) {
	run, err := s.loadExpeditionRun(r, r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found")
		return
	}
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}
	if run.status != "active" {
		writeError(w, http.StatusBadRequest, "expedition must be active to collect")
		return
	}

	zone := expedition.GetZone(run.zoneID)
	if zone == nil {
		writeError(w, http.StatusInternalServerError, "unknown zone")
		return
	}

	sc, err := s.loadChar(r.Context(), run.characterID)
	if err != nil {
		log.Printf("load character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	elapsed := elapsedSeconds(run)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	sim := *sc.c
	result := expedition.Calculate(&sim, sc.c.XP, sc.gold, zone, elapsed, rng)

	if result.CannotSurvive {
		writeJSON(w, http.StatusOK, collectExpeditionResponse{
			CannotSurvive: true,
			Character:     sc.toResponse(),
			Loot:          []lootEntry{},
		})
		return
	}

	loot, err := s.persistCollect(r, run.characterID, run.id, "", result)
	if err != nil {
		log.Printf("persist collect: %v", err)
		writeError(w, http.StatusInternalServerError, "could not apply rewards")
		return
	}

	writeJSON(w, http.StatusOK, collectExpeditionResponse{
		XPGained:       result.XPGained,
		GoldGained:     result.GoldGained,
		LevelsGained:   result.LevelsGained,
		ElapsedSeconds: elapsed,
		Character:      buildCharResp(sc, result),
		Loot:           loot,
	})
}

// ── POST /expedition-runs/{id}/pause ─────────────────────────────────────────

func (s *server) handlePauseExpedition(w http.ResponseWriter, r *http.Request) {
	run, err := s.loadExpeditionRun(r, r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found")
		return
	}
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}
	if run.status == "paused" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "paused"})
		return
	}

	if _, err := s.pool.Exec(r.Context(), `
		UPDATE expedition_runs
		SET accumulated_seconds = accumulated_seconds + EXTRACT(EPOCH FROM (NOW() - last_activity_at))::BIGINT,
		    last_activity_at = NOW(),
		    status = 'paused'
		WHERE id = $1
	`, run.id); err != nil {
		log.Printf("pause expedition: %v", err)
		writeError(w, http.StatusInternalServerError, "could not pause expedition")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "paused"})
}

// ── POST /expedition-runs/{id}/resume ────────────────────────────────────────

func (s *server) handleResumeExpedition(w http.ResponseWriter, r *http.Request) {
	run, err := s.loadExpeditionRun(r, r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found")
		return
	}
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}
	if run.status == "active" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "active"})
		return
	}

	if _, err := s.pool.Exec(r.Context(), `
		UPDATE expedition_runs
		SET last_activity_at = NOW(), status = 'active'
		WHERE id = $1
	`, run.id); err != nil {
		log.Printf("resume expedition: %v", err)
		writeError(w, http.StatusInternalServerError, "could not resume expedition")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "active"})
}

// ── POST /expedition-runs/{id}/zone ──────────────────────────────────────────

type switchZoneRequest struct {
	ZoneID string `json:"zone_id"`
}

func (s *server) handleSwitchZone(w http.ResponseWriter, r *http.Request) {
	var req switchZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.ZoneID == "" {
		writeError(w, http.StatusBadRequest, "zone_id required")
		return
	}

	newZone := expedition.GetZone(req.ZoneID)
	if newZone == nil {
		writeError(w, http.StatusBadRequest, "unknown zone")
		return
	}

	run, err := s.loadExpeditionRun(r, r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found")
		return
	}
	if err != nil {
		log.Printf("load expedition run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}

	if run.zoneID == req.ZoneID {
		zoneName := newZone.Name
		writeJSON(w, http.StatusOK, switchZoneResponse{ZoneID: run.zoneID, ZoneName: zoneName})
		return
	}

	sc, err := s.loadChar(r.Context(), run.characterID)
	if err != nil {
		log.Printf("load character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}
	if sc.c.Level < newZone.MinLevel {
		writeError(w, http.StatusBadRequest, "character level too low for this zone")
		return
	}

	currentZone := expedition.GetZone(run.zoneID)
	if currentZone == nil {
		writeError(w, http.StatusInternalServerError, "current zone unknown")
		return
	}

	elapsed := elapsedSeconds(run)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	sim := *sc.c
	result := expedition.Calculate(&sim, sc.c.XP, sc.gold, currentZone, elapsed, rng)

	// Single transaction: collect + zone switch
	loot, err := s.persistCollect(r, run.characterID, run.id, req.ZoneID, result)
	if err != nil {
		log.Printf("persist collect+zone switch: %v", err)
		writeError(w, http.StatusInternalServerError, "could not switch zone")
		return
	}

	var charResp characterResponse
	if result.CannotSurvive {
		charResp = sc.toResponse()
	} else {
		charResp = buildCharResp(sc, result)
	}

	writeJSON(w, http.StatusOK, switchZoneResponse{
		ZoneID:   req.ZoneID,
		ZoneName: newZone.Name,
		Collect: collectExpeditionResponse{
			CannotSurvive:  result.CannotSurvive,
			XPGained:       result.XPGained,
			GoldGained:     result.GoldGained,
			LevelsGained:   result.LevelsGained,
			ElapsedSeconds: elapsed,
			Character:      charResp,
			Loot:           loot,
		},
	})
}
