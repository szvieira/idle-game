package main

import (
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"time"

	"game/internal/character"
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
	ID             string          `json:"id"`
	CharacterID    string          `json:"character_id"`
	ZoneID         string          `json:"zone_id"`
	ZoneName       string          `json:"zone_name"`
	Status         string          `json:"status"`
	StartedAt      time.Time       `json:"started_at"`
	ElapsedSeconds int64           `json:"elapsed_seconds"`
	Zone           zoneDefResponse `json:"zone_def"`
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

type enemyDefResponse struct {
	Name    string `json:"name"`
	HP      int    `json:"hp"`
	Attack  int    `json:"attack"`
	Defense int    `json:"defense"`
}

type zoneRoomDefResponse struct {
	XP      int                `json:"xp"`
	Gold    int                `json:"gold"`
	Enemies []enemyDefResponse `json:"enemies"`
}

type zoneDefResponse struct {
	ID       string               `json:"id"`
	Name     string               `json:"name"`
	MinLevel int                  `json:"min_level"`
	Rooms    []zoneRoomDefResponse `json:"rooms"`
}

func zoneToResponse(z *expedition.Zone) zoneDefResponse {
	rooms := make([]zoneRoomDefResponse, len(z.Rooms))
	for i, r := range z.Rooms {
		enemies := make([]enemyDefResponse, len(r.Enemies))
		for j, e := range r.Enemies {
			enemies[j] = enemyDefResponse{Name: e.Name, HP: e.HP, Attack: e.Attack, Defense: e.Defense}
		}
		rooms[i] = zoneRoomDefResponse{XP: r.XP, Gold: r.Gold, Enemies: enemies}
	}
	return zoneDefResponse{ID: z.ID, Name: z.Name, MinLevel: z.MinLevel, Rooms: rooms}
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
		ID:          sc.id,
		Name:        sc.name,
		Class:       sc.c.Class,
		Level:       result.NewLevel,
		XP:          result.NewXP,
		XPToNext:    result.NewXPToNext,
		Gold:        result.NewGold,
		HP:          result.NewHP,
		MaxHP:       result.NewMaxHP,
		Attack:      result.NewAttack,
		Defense:     sc.c.Defense,
		Critical:    sc.c.Critical,
		CDR:         sc.c.CDR,
		SpecialName: sc.c.SpecialName,
		SpecialMult: sc.c.SpecialMult,
		SpecialHeal: sc.c.SpecialHeal,
		SpecialCD:   sc.c.SpecialCD,
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

func runToResponse(run *expeditionRun, zone *expedition.Zone) expeditionRunResponse {
	resp := expeditionRunResponse{
		ID:             run.id,
		CharacterID:    run.characterID,
		ZoneID:         run.zoneID,
		Status:         run.status,
		StartedAt:      run.startedAt,
		ElapsedSeconds: elapsedSeconds(run),
	}
	if zone != nil {
		resp.ZoneName = zone.Name
		resp.Zone = zoneToResponse(zone)
	}
	return resp
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

	// Run may already exist with a different zone; use the actual run's zone
	actualZone := expedition.GetZone(run.zoneID)
	writeJSON(w, http.StatusCreated, runToResponse(run, actualZone))
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

	zone := expedition.GetZone(run.zoneID)
	writeJSON(w, http.StatusOK, runToResponse(run, zone))
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

	sc, err := s.loadCharEffective(r.Context(), run.characterID)
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
	if run.status != "active" {
		writeError(w, http.StatusBadRequest, "expedition must be active to switch zone")
		return
	}

	if run.zoneID == req.ZoneID {
		zoneName := newZone.Name
		writeJSON(w, http.StatusOK, switchZoneResponse{ZoneID: run.zoneID, ZoneName: zoneName})
		return
	}

	sc, err := s.loadCharEffective(r.Context(), run.characterID)
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

// ── POST /expedition-runs/{id}/complete ──────────────────────────────────────

type completeExpeditionRequest struct {
	XP    int      `json:"xp"`
	Gold  int      `json:"gold"`
	Items []string `json:"items"` // item template names
}

type completeExpeditionResponse struct {
	Character   characterResponse       `json:"character"`
	ItemsAdded  []inventoryItemResponse `json:"items_added"`
	DroppedItem *droppedItemResponse    `json:"dropped_item"`
}

func (s *server) handleCompleteExpedition(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("id")

	var req completeExpeditionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.XP < 0 || req.Gold < 0 {
		writeError(w, http.StatusBadRequest, "xp and gold must be non-negative")
		return
	}

	// All state changes must be atomic: lock the run and the character in a single
	// transaction so concurrent /complete calls can't both apply rewards.
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		log.Printf("complete expedition begin tx: %v", err)
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Lock the expedition run row and verify it is still active.
	var charID string
	err = tx.QueryRow(r.Context(), `
		SELECT character_id FROM expedition_runs
		WHERE id = $1 AND status = 'active'
		FOR UPDATE
	`, runID).Scan(&charID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expedition run not found or already completed")
		return
	}
	if err != nil {
		log.Printf("complete expedition load run: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load run")
		return
	}

	// Load character inside the transaction with a row lock.
	sc := &serverChar{c: &character.Character{}}
	err = tx.QueryRow(r.Context(), `
		SELECT id, name, gold, class, level, xp, xp_to_next,
		       hp, max_hp, attack, defense, critical, cdr
		FROM characters WHERE id = $1 FOR UPDATE
	`, charID).Scan(
		&sc.id, &sc.name, &sc.gold,
		&sc.c.Class, &sc.c.Level, &sc.c.XP, &sc.c.XPToNext,
		&sc.c.HP, &sc.c.MaxHP,
		&sc.c.Attack, &sc.c.Defense, &sc.c.Critical, &sc.c.CDR,
	)
	if err != nil {
		log.Printf("complete expedition load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}
	character.ApplyClassSkills(sc.c)

	sc.c.XP += req.XP
	sc.gold += req.Gold
	character.CheckLevelUp(sc.c, character.NopLevelUpHandler{})

	_, err = tx.Exec(r.Context(), `
		UPDATE characters
		SET xp = $1, xp_to_next = $2, level = $3, gold = $4,
		    hp = $5, max_hp = $6, attack = $7, defense = $8, critical = $9, cdr = $10
		WHERE id = $11
	`, sc.c.XP, sc.c.XPToNext, sc.c.Level, sc.gold,
		sc.c.HP, sc.c.MaxHP, sc.c.Attack, sc.c.Defense, sc.c.Critical, sc.c.CDR,
		charID)
	if err != nil {
		log.Printf("complete expedition update char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not update character")
		return
	}

	// Add items to inventory (looked up by template name; unknown names are skipped)
	var itemsAdded []inventoryItemResponse
	for _, itemName := range req.Items {
		var item inventoryItemResponse
		err := tx.QueryRow(r.Context(), `
			SELECT id, name, slot, rarity, source,
			       attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus
			FROM item_templates WHERE name = $1
		`, itemName).Scan(
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("complete expedition unknown item %q, skipping", itemName)
			continue
		}
		if err != nil {
			log.Printf("complete expedition load template %q: %v", itemName, err)
			writeError(w, http.StatusInternalServerError, "could not load item template")
			return
		}
		err = tx.QueryRow(r.Context(), `
			INSERT INTO inventory_items (character_id, item_template_id)
			VALUES ($1, $2)
			RETURNING id, character_id, item_template_id
		`, charID, item.Template.ID).Scan(&item.ID, &item.CharacterID, &item.ItemTemplateID)
		if err != nil {
			log.Printf("complete expedition insert item %q: %v", itemName, err)
			writeError(w, http.StatusInternalServerError, "could not add item")
			return
		}
		itemsAdded = append(itemsAdded, item)
	}

	// Mark run completed
	_, err = tx.Exec(r.Context(), `
		UPDATE expedition_runs SET status = 'completed' WHERE id = $1
	`, runID)
	if err != nil {
		log.Printf("complete expedition mark completed: %v", err)
		writeError(w, http.StatusInternalServerError, "could not complete run")
		return
	}

	// Loot drop inside the transaction so the item grant is atomic with the character update.
	var droppedItem *droppedItemResponse
	if rand.Float64() < 0.40 {
		var drop droppedItemResponse
		dropErr := tx.QueryRow(r.Context(), `
			SELECT id, name, slot, rarity, attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus
			FROM item_templates
			WHERE source = 'expedition'
			  AND (class_restriction IS NULL OR class_restriction = $1)
			ORDER BY RANDOM()
			LIMIT 1
		`, sc.c.Class).Scan(
			&drop.ID, &drop.Name, &drop.Slot, &drop.Rarity,
			&drop.AttackBonus, &drop.DefenseBonus, &drop.HPBonus, &drop.CritBonus, &drop.CDRBonus,
		)
		if dropErr == nil {
			if _, insertErr := tx.Exec(r.Context(),
				`INSERT INTO inventory_items (character_id, item_template_id) VALUES ($1, $2)`,
				charID, drop.ID,
			); insertErr != nil {
				log.Printf("complete expedition insert drop: %v", insertErr)
			} else {
				droppedItem = &drop
			}
		} else if !errors.Is(dropErr, pgx.ErrNoRows) {
			log.Printf("complete expedition loot query: %v", dropErr)
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("complete expedition commit: %v", err)
		writeError(w, http.StatusInternalServerError, "transaction commit failed")
		return
	}

	// Return effective character stats (with item bonuses applied)
	scEff, err := s.loadCharEffective(r.Context(), charID)
	if err != nil {
		log.Printf("complete expedition reload char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not reload character")
		return
	}

	if itemsAdded == nil {
		itemsAdded = []inventoryItemResponse{}
	}
	writeJSON(w, http.StatusOK, completeExpeditionResponse{
		Character:   scEff.toResponse(),
		ItemsAdded:  itemsAdded,
		DroppedItem: droppedItem,
	})
}
