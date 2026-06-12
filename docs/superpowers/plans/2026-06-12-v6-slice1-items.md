# Item System Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the item system to 6 equipment slots, 4 rarities, crit/cdr bonuses, and wire up expedition/dungeon complete endpoints that apply XP, gold, and loot server-side.

**Architecture:** Vertical slice — DB migrations first, then Go backend (EffectiveStats + handlers), then TypeScript client (types, API, GameState). Each layer tested before the next.

**Tech Stack:** Go 1.25, pgx/v5, net/http, PostgreSQL, TypeScript, Vitest

---

## File Map

| Action | Path |
|---|---|
| Create | `internal/db/migrations/000015_item_system_expansion.up.sql` |
| Create | `internal/db/migrations/000016_seed_v6_items.up.sql` |
| Create | `internal/character/items.go` |
| Create | `internal/character/items_test.go` |
| Modify | `internal/character/character.go` |
| Create | `cmd/server/handler_items.go` |
| Modify | `cmd/server/handler_characters.go` |
| Modify | `cmd/server/handler_expeditions.go` |
| Modify | `cmd/server/main.go` |
| Modify | `client/src/types/api.ts` |
| Modify | `client/src/state/GameState.ts` |
| Create | `client/src/api/items.ts` |
| Create | `client/src/__tests__/api/items.test.ts` |

---

## Task 1: DB Migration — Expand item_templates and equipment tables

**Files:**
- Create: `internal/db/migrations/000015_item_system_expansion.up.sql`

- [ ] **Step 1: Write the migration**

```sql
-- internal/db/migrations/000015_item_system_expansion.up.sql

-- Expand item_templates
ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS crit_bonus  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cdr_bonus   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'expedition';

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_slot_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_slot_check
  CHECK (slot IN ('Helmet','Armor','Weapon','Boots','Ring','Amulet'));

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_rarity_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_rarity_check
  CHECK (rarity IN ('Common','Uncommon','Rare','Epic'));

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_source_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_source_check
  CHECK (source IN ('expedition','dungeon'));

-- Expand equipment slots
ALTER TABLE equipment
  DROP CONSTRAINT IF EXISTS equipment_slot_check;
ALTER TABLE equipment
  ADD CONSTRAINT equipment_slot_check
  CHECK (slot IN ('Helmet','Armor','Weapon','Boots','Ring','Amulet'));

-- Add completed status to expedition_runs
ALTER TABLE expedition_runs
  DROP CONSTRAINT IF EXISTS expedition_runs_status_check;
ALTER TABLE expedition_runs
  ADD CONSTRAINT expedition_runs_status_check
  CHECK (status IN ('active','paused','completed'));
```

- [ ] **Step 2: Apply migration and verify**

```bash
go run ./cmd/server &
sleep 1
curl -s http://localhost:8080/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/000015_item_system_expansion.up.sql
git commit -m "feat(db): expand item slots, rarities, crit/cdr bonus columns"
```

---

## Task 2: DB Migration — Seed v6 items

**Files:**
- Create: `internal/db/migrations/000016_seed_v6_items.up.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- internal/db/migrations/000016_seed_v6_items.up.sql

-- Clear old items that don't match v6 design
DELETE FROM equipment;
DELETE FROM inventory_items;
DELETE FROM item_templates;

-- Common / expedition items
INSERT INTO item_templates (name, slot, rarity, source, attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus) VALUES
  ('Iron Sword',        'Weapon', 'Common',   'expedition',  4,  0,  0, 0,  0),
  ('Leather Chestplate','Armor',  'Common',   'expedition',  0,  1, 14, 0,  0),
  ('Leather Boots',     'Boots',  'Common',   'expedition',  0,  0,  8, 0,  0),
  ('Copper Ring',       'Ring',   'Common',   'expedition',  2,  0,  0, 0,  0),

-- Uncommon / expedition items
  ('Soldier''s Sword',  'Weapon', 'Uncommon', 'expedition',  8,  0,  0, 2,  0),
  ('Scout''s Helm',     'Helmet', 'Uncommon', 'expedition',  0,  2, 18, 0,  0),
  ('Quartz Amulet',     'Amulet', 'Uncommon', 'expedition',  0,  0,  0, 0,  5),

-- Rare / dungeon items
  ('Crypt Blade',       'Weapon', 'Rare',     'dungeon',    14,  0,  0, 5,  0),
  ('Watcher''s Helm',   'Helmet', 'Rare',     'dungeon',     0,  4, 30, 0,  0),
  ('Sepulchral Ring',   'Ring',   'Rare',     'dungeon',     6,  0,  0, 0,  5),
  ('Silent Boots',      'Boots',  'Rare',     'dungeon',     0,  0, 20, 4,  0),

-- Epic / dungeon items
  ('Crypt Lord''s Mantle','Armor','Epic',     'dungeon',     0,  8, 60, 0,  0),
  ('Profane Axe',       'Weapon', 'Epic',     'dungeon',    24,  0,  0, 8,  0),
  ('Crown of Bones',    'Helmet', 'Epic',     'dungeon',     0,  0, 40, 0, 10);
```

- [ ] **Step 2: Restart server to apply migration, then verify rows**

```bash
go run ./cmd/server &
sleep 1
# confirm 14 rows
psql $DATABASE_URL -c "SELECT name, slot, rarity, source FROM item_templates ORDER BY rarity, slot;"
kill %1
```

Expected: 14 rows with correct slot/rarity/source values.

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/000016_seed_v6_items.up.sql
git commit -m "feat(db): seed v6 item templates (14 items, 6 slots, 4 rarities)"
```

---

## Task 3: Go — EquippedBonus + ApplyEquipment

**Files:**
- Create: `internal/character/items.go`
- Create: `internal/character/items_test.go`

- [ ] **Step 1: Write the failing test**

```go
// internal/character/items_test.go
package character_test

import (
	"testing"
	"game/internal/character"
)

func baseWarrior() *character.Character {
	return &character.Character{
		Class: "Warrior", Level: 1,
		HP: 100, MaxHP: 100,
		Attack: 10, Defense: 5,
		Critical: 10, CDR: 0,
		XP: 0, XPToNext: 100,
		SpecialMult: 2.0, SpecialCD: 5, SpecialName: "Strike",
	}
}

func TestApplyEquipment_SumsAllBonuses(t *testing.T) {
	c := baseWarrior()
	bonuses := []character.EquippedBonus{
		{AttackBonus: 4, HPBonus: 14},
		{AttackBonus: 8, CritBonus: 2},
		{CDRBonus: 5},
	}
	character.ApplyEquipment(c, bonuses)

	if c.Attack != 22 {
		t.Errorf("Attack: got %d, want 22", c.Attack)
	}
	if c.MaxHP != 114 {
		t.Errorf("MaxHP: got %d, want 114", c.MaxHP)
	}
	if c.HP != 114 {
		t.Errorf("HP: got %d, want 114", c.HP)
	}
	if c.Critical != 12 {
		t.Errorf("Critical: got %d, want 12", c.Critical)
	}
	if c.CDR != 5 {
		t.Errorf("CDR: got %d, want 5", c.CDR)
	}
}

func TestApplyEquipment_CapsAtMaxValues(t *testing.T) {
	c := baseWarrior()
	c.Critical = 75
	c.CDR = 45
	bonuses := []character.EquippedBonus{
		{CritBonus: 10, CDRBonus: 10},
	}
	character.ApplyEquipment(c, bonuses)

	if c.Critical != 80 {
		t.Errorf("Critical cap: got %d, want 80", c.Critical)
	}
	if c.CDR != 50 {
		t.Errorf("CDR cap: got %d, want 50", c.CDR)
	}
}

func TestApplyEquipment_EmptyBonuses(t *testing.T) {
	c := baseWarrior()
	original := *c
	character.ApplyEquipment(c, nil)

	if c.Attack != original.Attack {
		t.Errorf("Attack changed with no bonuses")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
go test ./internal/character/... -run TestApplyEquipment -v
```

Expected: FAIL — `character.EquippedBonus undefined`

- [ ] **Step 3: Implement**

```go
// internal/character/items.go
package character

// EquippedBonus holds the stat bonuses from one equipped item.
type EquippedBonus struct {
	AttackBonus  int
	DefenseBonus int
	HPBonus      int
	CritBonus    int
	CDRBonus     int
}

// ApplyEquipment adds all item bonuses to the character in place.
// Call after base stats are set (level-up already applied).
func ApplyEquipment(c *Character, bonuses []EquippedBonus) {
	for _, b := range bonuses {
		c.Attack  += b.AttackBonus
		c.Defense += b.DefenseBonus
		c.MaxHP   += b.HPBonus
		c.HP      += b.HPBonus
		c.Critical += b.CritBonus
		c.CDR     += b.CDRBonus
	}
	if c.Critical > 80 { c.Critical = 80 }
	if c.CDR     > 50 { c.CDR = 50 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/character/... -run TestApplyEquipment -v
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add internal/character/items.go internal/character/items_test.go
git commit -m "feat(character): add EquippedBonus and ApplyEquipment"
```

---

## Task 4: Go — loadCharEffective (character + bonuses combined)

**Files:**
- Modify: `cmd/server/handler_characters.go`

- [ ] **Step 1: Add helpers to handler_characters.go**

Add after the existing `loadChar` function:

```go
// loadEquipmentBonuses fetches the stat bonuses of all items equipped by character.
func (s *server) loadEquipmentBonuses(ctx context.Context, charID string) ([]character.EquippedBonus, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM equipment e
		JOIN inventory_items ii ON ii.id = e.inventory_item_id
		JOIN item_templates  it ON it.id = ii.item_template_id
		WHERE e.character_id = $1
		  AND e.inventory_item_id IS NOT NULL
	`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bonuses []character.EquippedBonus
	for rows.Next() {
		var b character.EquippedBonus
		if err := rows.Scan(&b.AttackBonus, &b.DefenseBonus, &b.HPBonus,
			&b.CritBonus, &b.CDRBonus); err != nil {
			return nil, err
		}
		bonuses = append(bonuses, b)
	}
	return bonuses, rows.Err()
}

// loadCharEffective loads base char stats and applies all equipped item bonuses.
func (s *server) loadCharEffective(ctx context.Context, id string) (*serverChar, error) {
	sc, err := s.loadChar(ctx, id)
	if err != nil {
		return nil, err
	}
	bonuses, err := s.loadEquipmentBonuses(ctx, id)
	if err != nil {
		return nil, err
	}
	character.ApplyEquipment(sc.c, bonuses)
	return sc, nil
}
```

- [ ] **Step 2: Update handleGetCharacter to use loadCharEffective**

```go
func (s *server) handleGetCharacter(w http.ResponseWriter, r *http.Request) {
	sc, err := s.loadCharEffective(r.Context(), r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("get character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
go build ./cmd/server/...
```

Expected: exits 0, no output.

- [ ] **Step 4: Commit**

```bash
git add cmd/server/handler_characters.go
git commit -m "feat(server): GET /characters returns effective stats with item bonuses"
```

---

## Task 5: Go — Inventory and equip/unequip handlers

**Files:**
- Create: `cmd/server/handler_items.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Write handler_items.go**

```go
// cmd/server/handler_items.go
package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// ── Shared types ──────────────────────────────────────────────────────────────

type itemTemplateResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slot         string `json:"slot"`
	Rarity       string `json:"rarity"`
	Source       string `json:"source"`
	AttackBonus  int    `json:"attack_bonus"`
	DefenseBonus int    `json:"defense_bonus"`
	HPBonus      int    `json:"hp_bonus"`
	CritBonus    int    `json:"crit_bonus"`
	CDRBonus     int    `json:"cdr_bonus"`
}

type inventoryItemResponse struct {
	ID             string               `json:"id"`
	CharacterID    string               `json:"character_id"`
	ItemTemplateID string               `json:"item_template_id"`
	Template       itemTemplateResponse `json:"template"`
}

// ── GET /characters/{id}/inventory ───────────────────────────────────────────

func (s *server) handleGetInventory(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	rows, err := s.pool.Query(r.Context(), `
		SELECT ii.id, ii.character_id, ii.item_template_id,
		       it.id, it.name, it.slot, it.rarity, it.source,
		       it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM inventory_items ii
		JOIN item_templates it ON it.id = ii.item_template_id
		WHERE ii.character_id = $1
		ORDER BY ii.acquired_at DESC
	`, charID)
	if err != nil {
		log.Printf("get inventory: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch inventory")
		return
	}
	defer rows.Close()

	items := []inventoryItemResponse{}
	for rows.Next() {
		var item inventoryItemResponse
		if err := rows.Scan(
			&item.ID, &item.CharacterID, &item.ItemTemplateID,
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		); err != nil {
			log.Printf("scan inventory row: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch inventory")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		log.Printf("inventory rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch inventory")
		return
	}

	writeJSON(w, http.StatusOK, items)
}

// ── POST /characters/{id}/equipment/{slot} ────────────────────────────────────

type equipRequest struct {
	InventoryItemID string `json:"inventory_item_id"`
}

func (s *server) handleEquip(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")
	slot   := r.PathValue("slot")

	var req equipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.InventoryItemID == "" {
		writeError(w, http.StatusBadRequest, "inventory_item_id required")
		return
	}

	// Verify item belongs to character and matches slot
	var itemSlot string
	err := s.pool.QueryRow(r.Context(), `
		SELECT it.slot
		FROM inventory_items ii
		JOIN item_templates it ON it.id = ii.item_template_id
		WHERE ii.id = $1 AND ii.character_id = $2
	`, req.InventoryItemID, charID).Scan(&itemSlot)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found in inventory")
		return
	}
	if err != nil {
		log.Printf("equip verify: %v", err)
		writeError(w, http.StatusInternalServerError, "could not verify item")
		return
	}
	if itemSlot != slot {
		writeError(w, http.StatusBadRequest, "item slot does not match")
		return
	}

	// Upsert equipment row
	_, err = s.pool.Exec(r.Context(), `
		INSERT INTO equipment (character_id, slot, inventory_item_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (character_id, slot) DO UPDATE SET inventory_item_id = EXCLUDED.inventory_item_id
	`, charID, slot, req.InventoryItemID)
	if err != nil {
		log.Printf("equip upsert: %v", err)
		writeError(w, http.StatusInternalServerError, "could not equip item")
		return
	}

	sc, err := s.loadCharEffective(r.Context(), charID)
	if err != nil {
		log.Printf("equip load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}

// ── DELETE /characters/{id}/equipment/{slot} ──────────────────────────────────

func (s *server) handleUnequip(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")
	slot   := r.PathValue("slot")

	_, err := s.pool.Exec(r.Context(), `
		UPDATE equipment SET inventory_item_id = NULL
		WHERE character_id = $1 AND slot = $2
	`, charID, slot)
	if err != nil {
		log.Printf("unequip: %v", err)
		writeError(w, http.StatusInternalServerError, "could not unequip item")
		return
	}

	sc, err := s.loadCharEffective(r.Context(), charID)
	if err != nil {
		log.Printf("unequip load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}

// ── GET /characters/{id}/equipped ─────────────────────────────────────────────

func (s *server) handleGetEquipped(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	rows, err := s.pool.Query(r.Context(), `
		SELECT e.slot,
		       ii.id, ii.character_id, ii.item_template_id,
		       it.id, it.name, it.slot, it.rarity, it.source,
		       it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM equipment e
		JOIN inventory_items ii ON ii.id = e.inventory_item_id
		JOIN item_templates  it ON it.id = ii.item_template_id
		WHERE e.character_id = $1
		  AND e.inventory_item_id IS NOT NULL
	`, charID)
	if err != nil {
		log.Printf("get equipped: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch equipment")
		return
	}
	defer rows.Close()

	equipped := map[string]*inventoryItemResponse{}
	for rows.Next() {
		var eSlot string
		var item inventoryItemResponse
		if err := rows.Scan(
			&eSlot,
			&item.ID, &item.CharacterID, &item.ItemTemplateID,
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		); err != nil {
			log.Printf("scan equipped row: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch equipment")
			return
		}
		itemCopy := item
		equipped[eSlot] = &itemCopy
	}
	if err := rows.Err(); err != nil {
		log.Printf("equipped rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch equipment")
		return
	}

	writeJSON(w, http.StatusOK, equipped)
}
```

- [ ] **Step 2: Register routes in main.go**

In `cmd/server/main.go`, inside `routes()`, add after existing routes:

```go
mux.HandleFunc("GET /characters/{id}/inventory",           s.handleGetInventory)
mux.HandleFunc("GET /characters/{id}/equipped",            s.handleGetEquipped)
mux.HandleFunc("POST /characters/{id}/equipment/{slot}",   s.handleEquip)
mux.HandleFunc("DELETE /characters/{id}/equipment/{slot}", s.handleUnequip)
```

- [ ] **Step 3: Build**

```bash
go build ./cmd/server/...
```

Expected: exits 0.

- [ ] **Step 4: Smoke test (requires running server + a character in DB)**

```bash
go run ./cmd/server &
sleep 1
# Replace CHAR_ID with a real character UUID from your DB
CHAR_ID="your-char-uuid"
curl -s http://localhost:8080/characters/$CHAR_ID/inventory | jq .
curl -s http://localhost:8080/characters/$CHAR_ID/equipped | jq .
kill %1
```

Expected: `[]` for inventory (empty), `{}` for equipped.

- [ ] **Step 5: Commit**

```bash
git add cmd/server/handler_items.go cmd/server/main.go
git commit -m "feat(server): add inventory and equip/unequip endpoints"
```

---

## Task 6: Go — Expedition complete endpoint

**Files:**
- Modify: `cmd/server/handler_expeditions.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Add lootEntry type and completeExpedition handler**

Add to `cmd/server/handler_expeditions.go` (after existing types at top):

```go
type lootEntry struct {
	InventoryItemID string `json:"inventory_item_id"`
	Name            string `json:"name"`
	Rarity          string `json:"rarity"`
	Slot            string `json:"slot"`
}
```

Then add the handler at the end of the file:

```go
// ── POST /expedition-runs/{id}/complete ──────────────────────────────────────

type completeExpeditionRequest struct {
	XP    int      `json:"xp"`
	Gold  int      `json:"gold"`
	Items []string `json:"items"` // item_template IDs
}

type completeExpeditionResponse struct {
	Character  characterResponse       `json:"character"`
	ItemsAdded []inventoryItemResponse `json:"items_added"`
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

	// Load run to get character_id and verify it's active
	var charID string
	err := s.pool.QueryRow(r.Context(), `
		SELECT character_id FROM expedition_runs
		WHERE id = $1 AND status = 'active'
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

	// Begin transaction
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		log.Printf("complete expedition begin tx: %v", err)
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Apply XP and gold, check level-up
	sc, err := s.loadChar(r.Context(), charID)
	if err != nil {
		log.Printf("complete expedition load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}
	sc.c.XP   += req.XP
	sc.gold   += req.Gold
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

	// Add items to inventory
	var itemsAdded []inventoryItemResponse
	for _, templateID := range req.Items {
		var item inventoryItemResponse
		err := tx.QueryRow(r.Context(), `
			INSERT INTO inventory_items (character_id, item_template_id)
			VALUES ($1, $2)
			RETURNING id, character_id, item_template_id
		`, charID, templateID).Scan(&item.ID, &item.CharacterID, &item.ItemTemplateID)
		if err != nil {
			log.Printf("complete expedition insert item %s: %v", templateID, err)
			writeError(w, http.StatusInternalServerError, "could not add item")
			return
		}
		// Load template details
		err = tx.QueryRow(r.Context(), `
			SELECT id, name, slot, rarity, source,
			       attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus
			FROM item_templates WHERE id = $1
		`, templateID).Scan(
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		)
		if err != nil {
			log.Printf("complete expedition load template %s: %v", templateID, err)
			writeError(w, http.StatusInternalServerError, "could not load item template")
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

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("complete expedition commit: %v", err)
		writeError(w, http.StatusInternalServerError, "transaction commit failed")
		return
	}

	// Return effective character stats (with item bonuses)
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
		Character:  scEff.toResponse(),
		ItemsAdded: itemsAdded,
	})
}
```

- [ ] **Step 2: Register route in main.go**

In `routes()`, add:

```go
mux.HandleFunc("POST /expedition-runs/{id}/complete", s.handleCompleteExpedition)
```

- [ ] **Step 3: Build**

```bash
go build ./cmd/server/...
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add cmd/server/handler_expeditions.go cmd/server/main.go
git commit -m "feat(server): add POST /expedition-runs/{id}/complete endpoint"
```

---

## Task 7: Client — New types and GameState

**Files:**
- Modify: `client/src/types/api.ts`
- Modify: `client/src/state/GameState.ts`

- [ ] **Step 1: Add types to api.ts**

Append to `client/src/types/api.ts`:

```typescript
export interface ItemTemplate {
  id: string
  name: string
  slot: 'Helmet' | 'Armor' | 'Weapon' | 'Boots' | 'Ring' | 'Amulet'
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic'
  source: 'expedition' | 'dungeon'
  attack_bonus: number
  defense_bonus: number
  hp_bonus: number
  crit_bonus: number
  cdr_bonus: number
}

export interface InventoryItem {
  id: string
  character_id: string
  item_template_id: string
  template: ItemTemplate
}

export type EquipmentSlot = 'Helmet' | 'Armor' | 'Weapon' | 'Boots' | 'Ring' | 'Amulet'

export type EquippedSlots = Partial<Record<EquipmentSlot, InventoryItem>>

export interface CompleteExpeditionResult {
  character: Character
  items_added: InventoryItem[]
}
```

- [ ] **Step 2: Update GameState.ts**

```typescript
// client/src/state/GameState.ts
import type { Character, ExpeditionRun, InventoryItem, EquippedSlots } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null
  inventory: InventoryItem[] = []
  equipped: EquippedSlots = {}

  static readonly instance = new GameState()
}
```

- [ ] **Step 3: Build client to verify types compile**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds (or only pre-existing errors).

- [ ] **Step 4: Commit**

```bash
git add client/src/types/api.ts client/src/state/GameState.ts
git commit -m "feat(client): add item types and inventory/equipped to GameState"
```

---

## Task 8: Client — Item API functions

**Files:**
- Create: `client/src/api/items.ts`
- Create: `client/src/__tests__/api/items.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/__tests__/api/items.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

describe('items API', () => {
  beforeEach(() => mockFetch.mockReset())

  it('getInventory calls correct endpoint', async () => {
    const { getInventory } = await import('../../api/items')
    mockOk([])
    const result = await getInventory('char-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/inventory'),
      expect.any(Object),
    )
    expect(result).toEqual([])
  })

  it('equipItem calls POST with slot and item id', async () => {
    const { equipItem } = await import('../../api/items')
    mockOk({ id: 'char-123' })
    await equipItem('char-123', 'Weapon', 'inv-item-456')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/equipment/Weapon'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('unequipItem calls DELETE', async () => {
    const { unequipItem } = await import('../../api/items')
    mockOk({ id: 'char-123' })
    await unequipItem('char-123', 'Weapon')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/equipment/Weapon'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd client && npm test -- --run src/__tests__/api/items.test.ts 2>&1 | tail -10
```

Expected: FAIL — `../../api/items` not found.

- [ ] **Step 3: Implement items.ts**

```typescript
// client/src/api/items.ts
import type { InventoryItem, EquippedSlots, Character, EquipmentSlot, CompleteExpeditionResult } from '../types/api'
import { request } from './client'

export function getInventory(characterId: string): Promise<InventoryItem[]> {
  return request<InventoryItem[]>('GET', `/characters/${characterId}/inventory`)
}

export function getEquipped(characterId: string): Promise<EquippedSlots> {
  return request<EquippedSlots>('GET', `/characters/${characterId}/equipped`)
}

export function equipItem(characterId: string, slot: EquipmentSlot, inventoryItemId: string): Promise<Character> {
  return request<Character>('POST', `/characters/${characterId}/equipment/${slot}`, {
    inventory_item_id: inventoryItemId,
  })
}

export function unequipItem(characterId: string, slot: EquipmentSlot): Promise<Character> {
  return request<Character>('DELETE', `/characters/${characterId}/equipment/${slot}`)
}

export function completeExpedition(runId: string, xp: number, gold: number, items: string[]): Promise<CompleteExpeditionResult> {
  return request<CompleteExpeditionResult>('POST', `/expedition-runs/${runId}/complete`, { xp, gold, items })
}
```

- [ ] **Step 4: Run tests**

```bash
cd client && npm test -- --run src/__tests__/api/items.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/api/items.ts client/src/__tests__/api/items.test.ts
git commit -m "feat(client): add item API functions (inventory, equip, unequip, complete)"
```

---

## Slice 1 Complete ✓

Item system is now fully wired end-to-end:
- DB has 6 slots, 4 rarities, 14 v6 items with crit/cdr bonuses
- `GET /characters/:id` returns effective stats including equipped item bonuses
- `GET /characters/:id/inventory` — list all items
- `POST /characters/:id/equipment/:slot` — equip
- `DELETE /characters/:id/equipment/:slot` — unequip
- `POST /expedition-runs/:id/complete` — apply XP/gold/loot, mark run done
- Client has matching types, GameState fields, and API functions

**Next:** [Slice 2 — Paper Doll](2026-06-12-v6-slice2-paperdoll.md)
