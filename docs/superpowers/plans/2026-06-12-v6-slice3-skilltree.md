# Skill Tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full skill tree system — DB tables, Go backend (unlock/equip API, passive stat application), TypeScript client (API + CharacterSheet skills tab).

**Architecture:** `skill_nodes` table seeded with 6 nodes. `character_skill_nodes` tracks unlocks per character. `characters.equipped_skill` stores active skill choice. `EffectiveStats` applies passive effects. Skill tab in CharacterSheetScene renders the tree with clickable nodes.

**Dependencies:** Requires Slice 1 (character types, loadCharEffective pattern).

**Tech Stack:** Go 1.25, pgx/v5, TypeScript, Phaser 3.80, Vitest

---

## File Map

| Action | Path |
|---|---|
| Create | `internal/db/migrations/000017_skill_tree.up.sql` |
| Create | `internal/character/skills.go` |
| Create | `internal/character/skills_test.go` |
| Create | `cmd/server/handler_skills.go` |
| Modify | `cmd/server/handler_characters.go` |
| Modify | `cmd/server/main.go` |
| Modify | `client/src/types/api.ts` |
| Create | `client/src/api/skills.ts` |
| Create | `client/src/__tests__/api/skills.test.ts` |
| Modify | `client/src/scenes/CharacterSheetScene.ts` |

---

## Task 13: DB Migration — Skill tree tables and seed

**Files:**
- Create: `internal/db/migrations/000017_skill_tree.up.sql`

- [ ] **Step 1: Write the migration**

```sql
-- internal/db/migrations/000017_skill_tree.up.sql

CREATE TABLE skill_nodes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('active','passive')),
  requires_id TEXT REFERENCES skill_nodes(id),
  effect      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE character_skill_nodes (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  node_id      TEXT NOT NULL REFERENCES skill_nodes(id),
  PRIMARY KEY (character_id, node_id)
);

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS equipped_skill TEXT NOT NULL DEFAULT 'whirlwind';

-- Seed skill nodes
-- Left branch: offensive → Charge (new active)
-- Right branch: defensive passives
INSERT INTO skill_nodes (id, name, type, requires_id, effect) VALUES
  ('whirlwind',   'Whirlwind',   'active',  NULL,         '{}'),
  ('brute_force', 'Brute Force', 'passive', 'whirlwind',  '{"atk_pct": 10}'),
  ('fury',        'Fury',        'passive', 'brute_force','{"crit": 5}'),
  ('charge',      'Charge',      'active',  'fury',       '{}'),
  ('iron_skin',   'Iron Skin',   'passive', 'whirlwind',  '{"hp_pct": 15}'),
  ('vigor',       'Vigor',       'passive', 'iron_skin',  '{"def": 4}');

-- Every existing character starts with whirlwind unlocked
INSERT INTO character_skill_nodes (character_id, node_id)
  SELECT id, 'whirlwind' FROM characters
  ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply and verify**

```bash
go run ./cmd/server &
sleep 1
curl -s http://localhost:8080/health
psql $DATABASE_URL -c "SELECT id, type, requires_id FROM skill_nodes ORDER BY id;"
kill %1
```

Expected: 6 rows (whirlwind, brute_force, fury, charge, iron_skin, vigor).

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/000017_skill_tree.up.sql
git commit -m "feat(db): add skill_tree tables and seed 6 nodes"
```

---

## Task 14: Go — Skill effects and ApplyPassiveSkills

**Files:**
- Create: `internal/character/skills.go`
- Create: `internal/character/skills_test.go`

- [ ] **Step 1: Write the failing test**

```go
// internal/character/skills_test.go
package character_test

import (
	"testing"
	"game/internal/character"
)

func TestApplyPassiveSkills_AtkPercent(t *testing.T) {
	c := baseWarrior() // from items_test.go — Attack: 10
	effects := []character.SkillEffect{
		{AtkPct: 10},
	}
	character.ApplyPassiveSkills(c, effects)
	if c.Attack != 11 {
		t.Errorf("Attack: got %d, want 11", c.Attack)
	}
}

func TestApplyPassiveSkills_HPPercent(t *testing.T) {
	c := baseWarrior() // MaxHP: 100
	effects := []character.SkillEffect{
		{HPPct: 15},
	}
	character.ApplyPassiveSkills(c, effects)
	if c.MaxHP != 115 {
		t.Errorf("MaxHP: got %d, want 115", c.MaxHP)
	}
	if c.HP != 115 {
		t.Errorf("HP: got %d, want 115", c.HP)
	}
}

func TestApplyPassiveSkills_Crit(t *testing.T) {
	c := baseWarrior() // Critical: 10
	effects := []character.SkillEffect{{Crit: 5}}
	character.ApplyPassiveSkills(c, effects)
	if c.Critical != 15 {
		t.Errorf("Critical: got %d, want 15", c.Critical)
	}
}

func TestApplyPassiveSkills_Def(t *testing.T) {
	c := baseWarrior() // Defense: 5
	effects := []character.SkillEffect{{Def: 4}}
	character.ApplyPassiveSkills(c, effects)
	if c.Defense != 9 {
		t.Errorf("Defense: got %d, want 9", c.Defense)
	}
}

func TestSkillPointsAvailable(t *testing.T) {
	tests := []struct {
		level          int
		unlockedCount  int // includes whirlwind
		wantPoints     int
	}{
		{1, 1, 0},  // level 1, only whirlwind → 0 points
		{2, 1, 1},  // level 2, only whirlwind → 1 point
		{5, 3, 2},  // level 5, 3 nodes unlocked → 5-1-2 = 2 points
	}
	for _, tt := range tests {
		got := character.SkillPointsAvailable(tt.level, tt.unlockedCount)
		if got != tt.wantPoints {
			t.Errorf("level=%d unlocked=%d: got %d, want %d",
				tt.level, tt.unlockedCount, got, tt.wantPoints)
		}
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
go test ./internal/character/... -run "TestApplyPassive|TestSkillPoints" -v
```

Expected: FAIL — `character.SkillEffect undefined`

- [ ] **Step 3: Implement skills.go**

```go
// internal/character/skills.go
package character

// SkillEffect holds the passive bonuses granted by a skill node.
// Values are stored as integers; atk_pct and hp_pct are whole percentages.
type SkillEffect struct {
	AtkPct int `json:"atk_pct,omitempty"`
	HPPct  int `json:"hp_pct,omitempty"`
	Crit   int `json:"crit,omitempty"`
	Def    int `json:"def,omitempty"`
	CDR    int `json:"cdr,omitempty"`
}

// ApplyPassiveSkills applies all passive node effects to the character in place.
// Call after ApplyEquipment so both bonuses are stacked correctly.
func ApplyPassiveSkills(c *Character, effects []SkillEffect) {
	for _, e := range effects {
		if e.AtkPct > 0 {
			c.Attack = c.Attack * (100 + e.AtkPct) / 100
		}
		if e.HPPct > 0 {
			bonus := c.MaxHP * e.HPPct / 100
			c.MaxHP += bonus
			c.HP    += bonus
		}
		c.Critical += e.Crit
		c.Defense  += e.Def
		c.CDR      += e.CDR
	}
	if c.Critical > 80 { c.Critical = 80 }
	if c.CDR     > 50 { c.CDR = 50 }
}

// SkillPointsAvailable returns how many skill points the character has to spend.
// unlockedCount includes the free starting node (whirlwind).
func SkillPointsAvailable(level, unlockedCount int) int {
	points := (level - 1) - (unlockedCount - 1)
	if points < 0 {
		return 0
	}
	return points
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/character/... -run "TestApplyPassive|TestSkillPoints" -v
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add internal/character/skills.go internal/character/skills_test.go
git commit -m "feat(character): add SkillEffect, ApplyPassiveSkills, SkillPointsAvailable"
```

---

## Task 15: Go — Wire passive skills into loadCharEffective

**Files:**
- Modify: `cmd/server/handler_characters.go`

- [ ] **Step 1: Add loadPassiveSkillEffects helper**

Add after `loadEquipmentBonuses` in `cmd/server/handler_characters.go`:

```go
// loadPassiveSkillEffects fetches and unmarshals effects of all unlocked passive nodes.
func (s *server) loadPassiveSkillEffects(ctx context.Context, charID string) ([]character.SkillEffect, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sn.effect
		FROM character_skill_nodes csn
		JOIN skill_nodes sn ON sn.id = csn.node_id
		WHERE csn.character_id = $1 AND sn.type = 'passive'
	`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var effects []character.SkillEffect
	for rows.Next() {
		var e character.SkillEffect
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		effects = append(effects, e)
	}
	return effects, rows.Err()
}
```

- [ ] **Step 2: Update loadCharEffective to also apply skill effects**

Replace the existing `loadCharEffective` function:

```go
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

	effects, err := s.loadPassiveSkillEffects(ctx, id)
	if err != nil {
		return nil, err
	}
	character.ApplyPassiveSkills(sc.c, effects)

	return sc, nil
}
```

- [ ] **Step 3: pgx JSONB scan — add Scan interface for SkillEffect**

pgx scans JSONB into `[]byte`. Add a `Scan` method to `SkillEffect` in `internal/character/skills.go`:

```go
import "encoding/json"

func (e *SkillEffect) Scan(src any) error {
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, e)
	case string:
		return json.Unmarshal([]byte(v), e)
	default:
		return nil
	}
}
```

- [ ] **Step 4: Build**

```bash
go build ./...
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add internal/character/skills.go cmd/server/handler_characters.go
git commit -m "feat(server): apply passive skill effects in loadCharEffective"
```

---

## Task 16: Go — Skill tree handlers

**Files:**
- Create: `cmd/server/handler_skills.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Write handler_skills.go**

```go
// cmd/server/handler_skills.go
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

type skillStateResponse struct {
	Unlocked        []string `json:"unlocked"`
	EquippedSkill   string   `json:"equipped_skill"`
	AvailablePoints int      `json:"available_points"`
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
	var equippedSkill string
	var level int
	err = s.pool.QueryRow(r.Context(), `
		SELECT equipped_skill, level FROM characters WHERE id = $1
	`, charID).Scan(&equippedSkill, &level)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("get skills char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}

	writeJSON(w, http.StatusOK, skillStateResponse{
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
	var nodeType    string
	var requiresID  *string
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
```

- [ ] **Step 2: Register routes in main.go**

In `routes()`, add:

```go
mux.HandleFunc("GET /characters/{id}/skills",                    s.handleGetSkills)
mux.HandleFunc("POST /characters/{id}/skills/{nodeId}/unlock",   s.handleUnlockSkill)
mux.HandleFunc("PUT /characters/{id}/skills/equipped",           s.handleEquipSkill)
```

- [ ] **Step 3: Build**

```bash
go build ./cmd/server/...
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add cmd/server/handler_skills.go cmd/server/main.go
git commit -m "feat(server): add skill tree endpoints (get, unlock, equip)"
```

---

## Task 17: Client — Skill types and API

**Files:**
- Modify: `client/src/types/api.ts`
- Create: `client/src/api/skills.ts`
- Create: `client/src/__tests__/api/skills.test.ts`

- [ ] **Step 1: Add skill types to api.ts**

Append to `client/src/types/api.ts`:

```typescript
export interface SkillNode {
  id: string
  name: string
  type: 'active' | 'passive'
  requires_id: string | null
  col: number
  row: number
}

export interface CharacterSkills {
  unlocked: string[]
  equipped_skill: string
  available_points: number
}
```

- [ ] **Step 2: Write failing test**

```typescript
// client/src/__tests__/api/skills.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) })
}

describe('skills API', () => {
  beforeEach(() => mockFetch.mockReset())

  it('getSkills calls correct endpoint', async () => {
    const { getSkills } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind'], equipped_skill: 'whirlwind', available_points: 0 })
    const result = await getSkills('char-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills'),
      expect.any(Object),
    )
    expect(result.unlocked).toContain('whirlwind')
  })

  it('unlockSkill calls POST', async () => {
    const { unlockSkill } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind', 'brute_force'], equipped_skill: 'whirlwind', available_points: 0 })
    await unlockSkill('char-123', 'brute_force')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills/brute_force/unlock'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('equipSkill calls PUT', async () => {
    const { equipSkill } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind', 'charge'], equipped_skill: 'charge', available_points: 0 })
    await equipSkill('char-123', 'charge')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills/equipped'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd client && npm test -- --run src/__tests__/api/skills.test.ts 2>&1 | tail -5
```

Expected: FAIL — `../../api/skills` not found.

- [ ] **Step 4: Implement skills.ts**

```typescript
// client/src/api/skills.ts
import type { CharacterSkills } from '../types/api'
import { request } from './client'

export function getSkills(characterId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('GET', `/characters/${characterId}/skills`)
}

export function unlockSkill(characterId: string, nodeId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('POST', `/characters/${characterId}/skills/${nodeId}/unlock`)
}

export function equipSkill(characterId: string, nodeId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('PUT', `/characters/${characterId}/skills/equipped`, {
    node_id: nodeId,
  })
}
```

- [ ] **Step 5: Run tests**

```bash
cd client && npm test -- --run src/__tests__/api/skills.test.ts 2>&1 | tail -5
```

Expected: PASS (3 tests).

- [ ] **Step 6: Update GameState to hold skills**

In `client/src/state/GameState.ts`, add `skills` field:

```typescript
import type { Character, ExpeditionRun, InventoryItem, EquippedSlots, CharacterSkills } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null
  inventory: InventoryItem[] = []
  equipped: EquippedSlots = {}
  skills: CharacterSkills = { unlocked: [], equipped_skill: 'whirlwind', available_points: 0 }

  static readonly instance = new GameState()
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/types/api.ts client/src/api/skills.ts \
        client/src/__tests__/api/skills.test.ts client/src/state/GameState.ts
git commit -m "feat(client): add skill types, API functions, and GameState.skills"
```

---

## Task 18: Client — Skills tab in CharacterSheetScene

**Files:**
- Modify: `client/src/scenes/CharacterSheetScene.ts`

This adds the skill tree tab. The full 3-tab implementation will be completed in Slice 4; this task adds a functional skills view to the existing scene.

- [ ] **Step 1: Add skill tree layout constants**

The tree has 6 nodes. Layout by column/row:

```
                  whirlwind (col 0, row 0)
          /                              \
  brute_force (col -1, row 1)       iron_skin (col 1, row 1)
       |                                  |
    fury (col -1, row 2)            vigor (col 1, row 2)
       |
  charge (col -1, row 3)
```

- [ ] **Step 2: Replace CharacterSheetScene with tabbed version**

Replace the full content of `client/src/scenes/CharacterSheetScene.ts`:

```typescript
import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { getInventory, getEquipped, unequipItem } from '../api/items'
import { getSkills, unlockSkill, equipSkill } from '../api/skills'
import type { InventoryItem, EquipmentSlot, CharacterSkills } from '../types/api'

const RARITY_COLOR: Record<string, number> = {
  Common: 0xb8c0cc, Uncommon: 0x5ec05e, Rare: 0x4da3ff, Epic: 0xc45aff,
}

type Tab = 'stats' | 'inventory' | 'skills'

interface NodeLayout {
  id: string
  name: string
  type: 'active' | 'passive'
  requiresId: string | null
  col: number
  row: number
}

const SKILL_TREE_LAYOUT: NodeLayout[] = [
  { id:'whirlwind',   name:'Whirlwind',   type:'active',  requiresId: null,          col: 0,  row: 0 },
  { id:'brute_force', name:'Brute Force', type:'passive', requiresId:'whirlwind',    col:-1,  row: 1 },
  { id:'fury',        name:'Fury',        type:'passive', requiresId:'brute_force',  col:-1,  row: 2 },
  { id:'charge',      name:'Charge',      type:'active',  requiresId:'fury',         col:-1,  row: 3 },
  { id:'iron_skin',   name:'Iron Skin',   type:'passive', requiresId:'whirlwind',    col: 1,  row: 1 },
  { id:'vigor',       name:'Vigor',       type:'passive', requiresId:'iron_skin',    col: 1,  row: 2 },
]

const SLOTS: EquipmentSlot[] = ['Helmet','Armor','Weapon','Boots','Ring','Amulet']
const SLOT_POS: Record<EquipmentSlot, { x: number; y: number }> = {
  Helmet: { x:400, y:160 }, Armor:  { x:400, y:260 }, Weapon: { x:260, y:210 },
  Boots:  { x:400, y:360 }, Ring:   { x:540, y:160 }, Amulet: { x:540, y:260 },
}

export class CharacterSheetScene extends Phaser.Scene {
  private doll!: PaperDollContainer
  private tabContents: Map<Tab, Phaser.GameObjects.GameObject[]> = new Map()
  private activeTab: Tab = 'stats'

  constructor() { super({ key: 'CharacterSheet' }) }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.add.rectangle(400, 300, 800, 600, 0x0d0d1a)

    // Tab buttons
    const tabs: Tab[] = ['stats', 'inventory', 'skills']
    const tabBtns = tabs.map((tab, i) => {
      const x = 160 + i * 180
      const btn = this.add.rectangle(x, 40, 160, 36, this.activeTab === tab ? 0x334466 : 0x222233)
        .setStrokeStyle(1, 0x445577).setInteractive({ useHandCursor: true })
      this.add.text(x, 40, tab.toUpperCase(), { font: '12px monospace', color: '#aaaacc' }).setOrigin(0.5)
      btn.on('pointerdown', () => this.switchTab(tab, tabBtns, tabs))
      return btn
    })

    // Back button
    const backBtn = this.add.rectangle(700, 40, 120, 36, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(700, 40, 'BACK', { font: '12px monospace', color: '#ffffff' }).setOrigin(0.5)
    backBtn.on('pointerdown', () => this.scene.start('Hub'))

    // Load data
    try {
      const [inventory, equipped, skills] = await Promise.all([
        getInventory(char.id),
        getEquipped(char.id),
        getSkills(char.id),
      ])
      GameState.instance.inventory = inventory
      GameState.instance.equipped  = equipped
      GameState.instance.skills    = skills
    } catch {
      this.add.text(400, 300, 'Error loading data', {
        font: '14px monospace', color: '#ff4444',
      }).setOrigin(0.5)
      return
    }

    this.buildStatsTab()
    this.buildInventoryTab()
    this.buildSkillsTab()
    this.showTab('stats')
  }

  private switchTab(tab: Tab, btns: Phaser.GameObjects.Rectangle[], tabs: Tab[]): void {
    tabs.forEach((t, i) => btns[i].setFillStyle(t === tab ? 0x334466 : 0x222233))
    this.showTab(tab)
  }

  private showTab(tab: Tab): void {
    for (const [t, objs] of this.tabContents) {
      objs.forEach(o => (o as any).setVisible?.(t === tab))
    }
    this.activeTab = tab
  }

  // ── Stats tab ──────────────────────────────────────────────────────────────
  private buildStatsTab(): void {
    const char  = GameState.instance.character!
    const eq    = GameState.instance.equipped
    const objs: Phaser.GameObjects.GameObject[] = []

    this.doll = new PaperDollContainer(this, 400, 280)
    objs.push(this.doll as any)

    // Apply overlays
    for (const slot of SLOTS) {
      const item = eq[slot]
      if (item) this.doll.equip(slot, item.template.name)
    }

    // Stat block
    const statLines = [
      `${char.name}  Lv.${char.level}  ${char.class}`,
      `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`,
      `ATK: ${char.attack}   DEF: ${char.defense}`,
      `CRIT: ${char.critical}%   CDR: ${char.cdr}%`,
    ]
    statLines.forEach((line, i) => {
      objs.push(this.add.text(20, 80 + i * 28, line, {
        font: '13px monospace', color: '#cccccc',
      }))
    })

    // Slot boxes
    for (const slot of SLOTS) {
      const pos  = SLOT_POS[slot]
      const item = eq[slot]
      const color = item ? RARITY_COLOR[item.template.rarity] : 0x444444
      const box  = this.add.rectangle(pos.x, pos.y, 140, 46, 0x1a1a2e)
        .setStrokeStyle(1, color)
      objs.push(box)
      objs.push(this.add.text(pos.x, pos.y - 8, slot,
        { font: '9px monospace', color: '#666688' }).setOrigin(0.5))
      objs.push(this.add.text(pos.x, pos.y + 9,
        item ? item.template.name : '—',
        { font: '10px monospace',
          color: item ? `#${color.toString(16).padStart(6,'0')}` : '#444466',
        }).setOrigin(0.5))
    }

    this.tabContents.set('stats', objs)
  }

  // ── Inventory tab ──────────────────────────────────────────────────────────
  private buildInventoryTab(): void {
    const char      = GameState.instance.character!
    const inventory = GameState.instance.inventory
    const objs: Phaser.GameObjects.GameObject[] = []

    objs.push(this.add.text(400, 75, 'INVENTORY', {
      font: '14px monospace', color: '#aaaacc',
    }).setOrigin(0.5))

    if (inventory.length === 0) {
      objs.push(this.add.text(400, 300, 'No items', {
        font: '13px monospace', color: '#555566',
      }).setOrigin(0.5))
    }

    const COLS = 4, CELL_W = 180, CELL_H = 56, START_X = 100, START_Y = 110
    inventory.forEach((item: InventoryItem, idx: number) => {
      const col  = idx % COLS
      const row  = Math.floor(idx / COLS)
      const x    = START_X + col * CELL_W
      const y    = START_Y + row * CELL_H
      const color = RARITY_COLOR[item.template.rarity]
      const equipped = Object.values(GameState.instance.equipped)
        .some(e => e?.id === item.id)

      const box = this.add.rectangle(x, y, CELL_W - 8, CELL_H - 6,
        equipped ? 0x1a2a1a : 0x1a1a2e)
        .setStrokeStyle(1, equipped ? 0x5ec05e : color)
        .setInteractive({ useHandCursor: true })
      objs.push(box)

      objs.push(this.add.text(x, y - 10, item.template.name,
        { font: '10px monospace',
          color: `#${color.toString(16).padStart(6,'0')}` }).setOrigin(0.5))

      const statsStr = [
        item.template.attack_bonus  ? `+${item.template.attack_bonus} ATK`  : '',
        item.template.hp_bonus      ? `+${item.template.hp_bonus} HP`       : '',
        item.template.defense_bonus ? `+${item.template.defense_bonus} DEF` : '',
        item.template.crit_bonus    ? `+${item.template.crit_bonus}% CRIT`  : '',
        item.template.cdr_bonus     ? `+${item.template.cdr_bonus}% CDR`    : '',
      ].filter(Boolean).join(' ')
      objs.push(this.add.text(x, y + 8, statsStr,
        { font: '9px monospace', color: '#888899' }).setOrigin(0.5))

      box.on('pointerdown', async () => {
        box.disableInteractive()
        try {
          const slot = item.template.slot as EquipmentSlot
          if (equipped) {
            await unequipItem(char.id, slot)
            delete GameState.instance.equipped[slot]
          } else {
            // Handled via equip endpoint — rebuild scene after
            const { equipItem } = await import('../api/items')
            const updated = await equipItem(char.id, slot, item.id)
            GameState.instance.character = updated
            GameState.instance.equipped[slot] = item
          }
          // Refresh scene
          this.scene.restart()
        } catch {
          box.setInteractive({ useHandCursor: true })
        }
      })
    })

    this.tabContents.set('inventory', objs)
  }

  // ── Skills tab ─────────────────────────────────────────────────────────────
  private buildSkillsTab(): void {
    const skills = GameState.instance.skills
    const char   = GameState.instance.character!
    const objs: Phaser.GameObjects.GameObject[] = []

    const CENTER_X = 400, BASE_Y = 120, COL_W = 160, ROW_H = 100

    objs.push(this.add.text(CENTER_X, 75,
      `SKILL TREE   —   ${skills.available_points} point(s) available`,
      { font: '12px monospace', color: '#aaaacc' }).setOrigin(0.5))

    // Draw connector lines first
    const g = this.add.graphics()
    objs.push(g)
    g.lineStyle(2, 0x334455, 1)
    SKILL_TREE_LAYOUT.forEach(node => {
      if (!node.requiresId) return
      const parent = SKILL_TREE_LAYOUT.find(n => n.id === node.requiresId)!
      const px = CENTER_X + parent.col * COL_W
      const py = BASE_Y   + parent.row * ROW_H
      const nx = CENTER_X + node.col   * COL_W
      const ny = BASE_Y   + node.row   * ROW_H
      g.strokeLineShape(new Phaser.Geom.Line(px, py, nx, ny))
    })

    // Draw nodes
    SKILL_TREE_LAYOUT.forEach(node => {
      const nx     = CENTER_X + node.col * COL_W
      const ny     = BASE_Y   + node.row * ROW_H
      const isUnlocked  = skills.unlocked.includes(node.id)
      const isEquipped  = skills.equipped_skill === node.id
      const prereqMet   = !node.requiresId || skills.unlocked.includes(node.requiresId)
      const canUnlock   = !isUnlocked && prereqMet && skills.available_points > 0

      const fillColor = isUnlocked ? 0x1a2a1a : 0x1a1a2e
      const borderColor = isEquipped  ? 0xffd34d
                        : isUnlocked  ? 0x5ec05e
                        : canUnlock   ? 0x334466
                        : 0x2a2a3a

      const box = this.add.rectangle(nx, ny, 120, 46, fillColor)
        .setStrokeStyle(2, borderColor)

      objs.push(box)
      objs.push(this.add.text(nx, ny - 8, node.name,
        { font: '10px monospace',
          color: isUnlocked ? '#88ff88' : canUnlock ? '#7788aa' : '#445566',
        }).setOrigin(0.5))
      objs.push(this.add.text(nx, ny + 9,
        isEquipped ? 'EQUIPPED' : node.type.toUpperCase(),
        { font: '8px monospace',
          color: isEquipped ? '#ffd34d' : '#556677',
        }).setOrigin(0.5))

      if (canUnlock || (isUnlocked && node.type === 'active' && !isEquipped)) {
        box.setInteractive({ useHandCursor: true })
        box.on('pointerdown', async () => {
          box.disableInteractive()
          try {
            if (canUnlock) {
              const updated = await unlockSkill(char.id, node.id)
              GameState.instance.skills = updated
            } else {
              const updated = await equipSkill(char.id, node.id)
              GameState.instance.skills = updated
            }
            this.scene.restart()
          } catch {
            box.setInteractive({ useHandCursor: true })
          }
        })
      }
    })

    this.tabContents.set('skills', objs)
  }
}
```

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/CharacterSheetScene.ts
git commit -m "feat(client): CharacterSheetScene with stats/inventory/skills tabs"
```

---

## Slice 3 Complete ✓

- DB has `skill_nodes` (6 nodes) and `character_skill_nodes` junction table
- `ApplyPassiveSkills` applies atk%, hp%, crit, def, cdr effects
- `loadCharEffective` stacks equipment + passive skill bonuses
- Skill endpoints: GET state, unlock node, equip active skill
- CharacterSheetScene has 3 working tabs with paper doll, inventory grid, skill tree

**Next:** [Slice 4 — Scene Rewrite](2026-06-12-v6-slice4-scenes.md)
