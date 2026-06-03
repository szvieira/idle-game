# Expedition Combat Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mana from the combat system (CDR-only specials), then add real-time combat visualization to the Phaser expedition panel so the player sees attacks, damage, and enemy deaths while idling.

**Architecture:** Mana removed from Go combat engine, character struct, and API. Server adds `zone_def` (rooms + enemies) and character special-ability fields to expedition response — single source of truth. Client `CombatSimulator` (pure TS) pre-computes full zone-loop event array; `CombatVisualizer` (Phaser component) replays events at 600ms/event inside the expedition panel, looping forever.

**Tech Stack:** Go, TypeScript, Phaser 3, Vitest

---

## Architecture Overview

```
Server
  POST /expedition-runs → ExpeditionRun {
    zone_def: { rooms: [{ enemies: [{ name, hp, attack, defense }] }] }
    character: { attack, defense, critical, cdr,
                 special_name, special_mult, special_heal, special_cd }
  }

Client
  CombatSimulator.simulateLoop(char, zoneDef) → CombatEvent[]
    — CDR-only trigger: cdTimer === 0 fires special
    — No mana anywhere

  CombatVisualizer
    — Replays CombatEvent[] at 600ms/event
    — HP bars, damage numbers, death/respawn
    — On loop end or death: re-simulate, restart
```

## Sequence Diagram

```
HubScene.create()
  → POST /expedition-runs
  ← ExpeditionRun { zone_def, character { special_name, special_cd, ... } }
  → new CombatVisualizer(scene, 32, 218)
  → visualizer.start(char, run.zone_def)
      → simulateLoop(char, zoneDef) → events[]
      → Phaser timer fires every 600ms
          → applyEvent() → HP bars, floatText, statusText
      → events exhausted → simulateLoop() → repeat

Player clicks Collect
  → visualizer.stop()
  → POST /expedition-runs/{id}/collect
  ← CollectResult { character, xp_gained, gold_gained }
  → GameState.character = result.character
  → show reward text 1.5s
  → visualizer.start(result.character, run.zone_def)
```

## File Map

| File | Change |
|---|---|
| `internal/character/character.go` | Remove `Mana`, `MaxMana`, `SpecialManaCost` fields |
| `internal/character/classes.go` | Remove mana/cost init from all 3 classes |
| `internal/combat/run.go` | Remove mana regen + mana gate; CDR-only special trigger |
| `cmd/server/handler_characters.go` | Remove mana from DB query, `characterResponse`, `toResponse()` |
| `cmd/server/handler_expeditions.go` | Add `zoneDefResponse` structs + helper; add `zone_def` to `expeditionRunResponse`; update `runToResponse` |
| `client/src/types/api.ts` | Remove mana fields from `Character`; add special fields + `EnemyDef`/`ZoneRoomDef`/`ZoneDef`; add `zone_def` to `ExpeditionRun` |
| `client/src/combat/CombatSimulator.ts` | New — pure TS combat engine, CDR-only |
| `client/src/combat/CombatVisualizer.ts` | New — Phaser component, replays events |
| `client/src/scenes/HubScene.ts` | Replace static expedition panel with `CombatVisualizer` |
| `client/src/__tests__/combat/CombatSimulator.test.ts` | New — unit tests |

---

## Task 1: Go — Remove mana from character struct and classes

**Files:**
- Modify: `internal/character/character.go`
- Modify: `internal/character/classes.go`

- [ ] **Step 1: Remove mana fields from `Character` struct**

Replace `internal/character/character.go`:

```go
package character

type Character struct {
	Class string
	Level int
	XP, XPToNext int
	HP, MaxHP    int
	Attack       int
	Defense      int
	Critical     int
	CDR          int

	SpecialName   string
	SpecialMult   float64
	SpecialHeal   int
	SpecialCD     int
	SpecialCDTimer int
}

func EffectiveCD(base, cdr int) int {
	cd := base * (100 - cdr) / 100
	if cd < 1 {
		return 1
	}
	return cd
}
```

- [ ] **Step 2: Remove mana from class constructors**

Replace `internal/character/classes.go`:

```go
package character

func NewWarrior() *Character {
	return &Character{
		Class: "Warrior", Level: 10, XP: 0, XPToNext: 100,
		HP: 280, MaxHP: 280,
		Attack: 30, Defense: 30, Critical: 5, CDR: 10,
		SpecialName: "Brutal Strike", SpecialMult: 2.2,
		SpecialCD: EffectiveCD(5, 10),
	}
}

func NewMage() *Character {
	return &Character{
		Class: "Mage", Level: 10, XP: 0, XPToNext: 100,
		HP: 140, MaxHP: 140,
		Attack: 48, Defense: 10, Critical: 15, CDR: 20,
		SpecialName: "Fireball", SpecialMult: 2.5,
		SpecialCD: EffectiveCD(4, 20),
	}
}

func NewPriest() *Character {
	return &Character{
		Class: "Priest", Level: 10, XP: 0, XPToNext: 100,
		HP: 200, MaxHP: 200,
		Attack: 18, Defense: 20, Critical: 5, CDR: 30,
		SpecialName: "Heal", SpecialHeal: 55,
		SpecialCD: EffectiveCD(3, 30),
	}
}

func ApplyClassSkills(c *Character) {
	var tmpl *Character
	switch c.Class {
	case "Warrior":
		tmpl = NewWarrior()
	case "Mage":
		tmpl = NewMage()
	case "Priest":
		tmpl = NewPriest()
	default:
		return
	}
	c.SpecialName = tmpl.SpecialName
	c.SpecialMult = tmpl.SpecialMult
	c.SpecialHeal = tmpl.SpecialHeal
	c.SpecialCD    = tmpl.SpecialCD
}
```

- [ ] **Step 3: Build to catch any broken references**

```bash
cd /home/gugu/work/development/idle-game
go build ./...
```

Expected: compile errors only in files that still reference `Mana`, `MaxMana`, or `SpecialManaCost`. Fix them in subsequent tasks.

---

## Task 2: Go — Remove mana from combat engine

**Files:**
- Modify: `internal/combat/run.go`

- [ ] **Step 1: Rewrite `run.go` with CDR-only specials**

```go
package combat

import (
	"math/rand"

	"game/internal/character"
)

type RoomStats struct {
	EnemiesDefeated int
	DamageDealt     int
	DamageTaken     int
	HealingReceived int
	Ticks           int
}

// RunCombat runs one character against one enemy until one of them dies.
// Special abilities trigger on cooldown only (no mana gate).
// Returns true if the character survived.
func RunCombat(c *character.Character, e *Enemy, stats *RoomStats, isBoss bool, rng *rand.Rand, h EventHandler) bool {
	h.OnEnemyIntro(e.Name, e.HP, e.MaxHP, isBoss)

	for tick := 1; ; tick++ {
		stats.Ticks++

		switch {
		case c.Class == "Priest" && c.HP < c.MaxHP/2 && c.SpecialCDTimer == 0:
			healed := c.SpecialHeal
			c.HP += healed
			if c.HP > c.MaxHP {
				healed -= c.HP - c.MaxHP
				c.HP = c.MaxHP
			}
			c.SpecialCDTimer = c.SpecialCD
			stats.HealingReceived += healed
			h.OnPlayerHeal(healed, c.SpecialName, c.HP, c.MaxHP)

		case c.Class != "Priest" && c.SpecialCDTimer == 0:
			dmg, isCrit := CalcDamage(rng, int(float64(c.Attack)*c.SpecialMult), e.Defense, c.Critical)
			e.HP -= dmg
			c.SpecialCDTimer = c.SpecialCD
			stats.DamageDealt += dmg
			h.OnPlayerAttack(dmg, isCrit, true, c.SpecialName, e.Name, max(0, e.HP), e.MaxHP, c.HP, c.MaxHP)

		default:
			dmg, isCrit := CalcDamage(rng, c.Attack, e.Defense, c.Critical)
			e.HP -= dmg
			stats.DamageDealt += dmg
			h.OnPlayerAttack(dmg, isCrit, false, "", e.Name, max(0, e.HP), e.MaxHP, c.HP, c.MaxHP)
		}

		if c.SpecialCDTimer > 0 {
			c.SpecialCDTimer--
		}

		if e.HP <= 0 {
			stats.EnemiesDefeated++
			h.OnEnemyDeath(e.Name, isBoss)
			return true
		}

		if tick%2 == 0 {
			eDmg, eCrit := CalcDamage(rng, e.Attack, c.Defense, 5)
			c.HP -= eDmg
			if c.HP < 0 {
				c.HP = 0
			}
			stats.DamageTaken += eDmg
			h.OnEnemyAttack(eDmg, eCrit, e.Name, c.HP, c.MaxHP)

			if c.HP <= 0 {
				return false
			}
		}
	}
}
```

- [ ] **Step 2: Build**

```bash
cd /home/gugu/work/development/idle-game
go build ./...
```

Expected: errors only in handler files still referencing mana. Fix next.

---

## Task 3: Go — Remove mana from server handler

**Files:**
- Modify: `cmd/server/handler_characters.go`

- [ ] **Step 1: Update `characterResponse`, `toResponse()`, and `loadChar()`**

Replace the shared types block in `handler_characters.go` (lines 18–82):

```go
type characterResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Class       string  `json:"class"`
	Level       int     `json:"level"`
	XP          int     `json:"xp"`
	XPToNext    int     `json:"xp_to_next"`
	Gold        int     `json:"gold"`
	HP          int     `json:"hp"`
	MaxHP       int     `json:"max_hp"`
	Attack      int     `json:"attack"`
	Defense     int     `json:"defense"`
	Critical    int     `json:"critical"`
	CDR         int     `json:"cdr"`
	SpecialName  string  `json:"special_name"`
	SpecialMult  float64 `json:"special_mult"`
	SpecialHeal  int     `json:"special_heal"`
	SpecialCD    int     `json:"special_cd"`
}

type serverChar struct {
	id   string
	name string
	gold int
	c    *character.Character
}

func (sc *serverChar) toResponse() characterResponse {
	return characterResponse{
		ID:          sc.id,
		Name:        sc.name,
		Class:       sc.c.Class,
		Level:       sc.c.Level,
		XP:          sc.c.XP,
		XPToNext:    sc.c.XPToNext,
		Gold:        sc.gold,
		HP:          sc.c.HP,
		MaxHP:       sc.c.MaxHP,
		Attack:      sc.c.Attack,
		Defense:     sc.c.Defense,
		Critical:    sc.c.Critical,
		CDR:         sc.c.CDR,
		SpecialName:  sc.c.SpecialName,
		SpecialMult:  sc.c.SpecialMult,
		SpecialHeal:  sc.c.SpecialHeal,
		SpecialCD:    sc.c.SpecialCD,
	}
}

func (s *server) loadChar(ctx context.Context, id string) (*serverChar, error) {
	sc := &serverChar{c: &character.Character{}}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, gold,
		       class, level, xp, xp_to_next,
		       hp, max_hp, attack, defense, critical, cdr
		FROM characters WHERE id = $1
	`, id).Scan(
		&sc.id, &sc.name, &sc.gold,
		&sc.c.Class, &sc.c.Level, &sc.c.XP, &sc.c.XPToNext,
		&sc.c.HP, &sc.c.MaxHP,
		&sc.c.Attack, &sc.c.Defense, &sc.c.Critical, &sc.c.CDR,
	)
	if err != nil {
		return nil, err
	}
	character.ApplyClassSkills(sc.c)
	return sc, nil
}
```

- [ ] **Step 2: Update `handleCreateCharacter` — remove mana from INSERT**

Replace the `handleCreateCharacter` INSERT query and RETURNING scan. Find the block starting at `err := s.pool.QueryRow(r.Context(), \`INSERT INTO characters`:

```go
err := s.pool.QueryRow(r.Context(), `
    INSERT INTO characters
        (name, class, level, xp, xp_to_next, gold,
         hp, max_hp, attack, defense, critical, cdr)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id, name, class, level, xp, xp_to_next, gold,
        hp, max_hp, attack, defense, critical, cdr
`,
    req.Name, c.Class, c.Level, c.XP, c.XPToNext, 0,
    c.HP, c.MaxHP, c.Attack, c.Defense, c.Critical, c.CDR,
).Scan(
    &resp.ID, &resp.Name, &resp.Class, &resp.Level, &resp.XP, &resp.XPToNext, &resp.Gold,
    &resp.HP, &resp.MaxHP, &resp.Attack, &resp.Defense, &resp.Critical, &resp.CDR,
)
```

- [ ] **Step 3: Build and test**

```bash
cd /home/gugu/work/development/idle-game
go build ./...
go test ./...
```

Expected: all pass. `mana`/`max_mana` columns remain in DB — unused but harmless; drop them in a separate migration later.

- [ ] **Step 4: Commit tasks 1–3**

```bash
git add internal/character/character.go internal/character/classes.go \
        internal/combat/run.go cmd/server/handler_characters.go
git commit -m "feat(combat): remove mana system — specials now CDR-only"
```

---

## Task 4: Go — Add `zone_def` to expedition response

**Files:**
- Modify: `cmd/server/handler_expeditions.go`

- [ ] **Step 1: Add zone response structs and `zoneToResponse` helper**

Insert after the `switchZoneResponse` struct (around line 52):

```go
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
```

- [ ] **Step 2: Add `Zone` field to `expeditionRunResponse`**

Replace the existing struct:

```go
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
```

- [ ] **Step 3: Update `runToResponse` to accept `*expedition.Zone`**

```go
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
```

- [ ] **Step 4: Update `handleStartExpedition` caller**

Find and replace this block near the end of `handleStartExpedition`:
```go
actualZoneName := run.zoneID
if z := expedition.GetZone(run.zoneID); z != nil {
    actualZoneName = z.Name
}
writeJSON(w, http.StatusCreated, runToResponse(run, actualZoneName))
```

Replace with:
```go
actualZone := expedition.GetZone(run.zoneID)
writeJSON(w, http.StatusCreated, runToResponse(run, actualZone))
```

- [ ] **Step 5: Update `handleGetExpedition` caller**

Find and replace this block in `handleGetExpedition`:
```go
zoneName := run.zoneID
if z := expedition.GetZone(run.zoneID); z != nil {
    zoneName = z.Name
}
writeJSON(w, http.StatusOK, runToResponse(run, zoneName))
```

Replace with:
```go
zone := expedition.GetZone(run.zoneID)
writeJSON(w, http.StatusOK, runToResponse(run, zone))
```

- [ ] **Step 6: Build and test**

```bash
cd /home/gugu/work/development/idle-game
go build ./...
go test ./...
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add cmd/server/handler_expeditions.go
git commit -m "feat(server): include zone_def in expedition run response"
```

---

## Task 5: TypeScript — Update API types

**Files:**
- Modify: `client/src/types/api.ts`

- [ ] **Step 1: Rewrite `types/api.ts`**

```typescript
export interface Character {
  id: string
  name: string
  class: 'Warrior' | 'Mage' | 'Priest'
  level: number
  xp: number
  xp_to_next: number
  gold: number
  hp: number
  max_hp: number
  attack: number
  defense: number
  critical: number
  cdr: number
  special_name: string
  special_mult: number
  special_heal: number
  special_cd: number
}

export interface EnemyDef {
  name: string
  hp: number
  attack: number
  defense: number
}

export interface ZoneRoomDef {
  xp: number
  gold: number
  enemies: EnemyDef[]
}

export interface ZoneDef {
  id: string
  name: string
  min_level: number
  rooms: ZoneRoomDef[]
}

export interface ExpeditionRun {
  id: string
  character_id: string
  zone_id: string
  zone_name: string
  status: 'active' | 'paused'
  started_at: string
  elapsed_seconds: number
  zone_def: ZoneDef
}

export interface LootEntry {
  inventory_item_id: string
  name: string
  rarity: string
  slot: string
}

export interface CollectResult {
  cannot_survive: boolean
  xp_gained: number
  gold_gained: number
  levels_gained: number
  elapsed_seconds: number
  character: Character
  loot: LootEntry[]
}

export interface SwitchZoneResult {
  zone_id: string
  zone_name: string
  collect: CollectResult
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/gugu/work/development/idle-game/client
npm run typecheck
```

Expected: 0 errors (HubScene may show `mana`/`max_mana` access errors — fix those in Task 7).

- [ ] **Step 3: Commit**

```bash
git add client/src/types/api.ts
git commit -m "feat(client): remove mana, add special fields and zone_def to API types"
```

---

## Task 6: TypeScript — `CombatSimulator` (pure logic, fully tested)

**Files:**
- Create: `client/src/combat/CombatSimulator.ts`
- Create: `client/src/__tests__/combat/CombatSimulator.test.ts`

CDR-only trigger: special fires whenever `cdTimer === 0`, no mana check.

- [ ] **Step 1: Create `client/src/combat/CombatSimulator.ts`**

```typescript
import type { ZoneDef } from '../types/api'

export interface CombatChar {
  hp: number
  maxHp: number
  attack: number
  defense: number
  critical: number
  class: string
  specialName: string
  specialMult: number
  specialHeal: number
  specialCd: number
}

export type CombatEvent =
  | { type: 'enemy_intro'; name: string; hp: number; maxHp: number }
  | { type: 'player_attack'; damage: number; isCrit: boolean; isSpecial: boolean; specialName: string; targetName: string; enemyHp: number; enemyMaxHp: number; playerHp: number; playerMaxHp: number }
  | { type: 'player_heal'; amount: number; specialName: string; playerHp: number; playerMaxHp: number }
  | { type: 'enemy_attack'; damage: number; isCrit: boolean; attackerName: string; playerHp: number; playerMaxHp: number }
  | { type: 'enemy_death'; name: string }
  | { type: 'room_complete'; roomIndex: number; totalRooms: number }
  | { type: 'loop_complete' }
  | { type: 'player_death' }

function calcDamage(attack: number, defense: number, critical: number): [number, boolean] {
  const variation = 0.9 + Math.random() * 0.2
  let dmg = Math.floor(attack * variation * (1 - defense / 100))
  if (dmg < 1) dmg = 1
  const isCrit = Math.floor(Math.random() * 100) < critical
  if (isCrit) dmg = Math.floor(dmg * 1.75)
  return [dmg, isCrit]
}

export function simulateLoop(charStats: CombatChar, zone: ZoneDef): CombatEvent[] {
  const events: CombatEvent[] = []
  const c = { ...charStats, hp: charStats.maxHp }
  let cdTimer = 0

  for (let roomIdx = 0; roomIdx < zone.rooms.length; roomIdx++) {
    const room = zone.rooms[roomIdx]

    for (const enemyDef of room.enemies) {
      let enemyHp = enemyDef.hp
      events.push({ type: 'enemy_intro', name: enemyDef.name, hp: enemyDef.hp, maxHp: enemyDef.hp })

      for (let tick = 1; ; tick++) {
        if (c.class === 'Priest' && c.hp < c.maxHp / 2 && cdTimer === 0) {
          let healed = c.specialHeal
          c.hp += healed
          if (c.hp > c.maxHp) {
            healed -= c.hp - c.maxHp
            c.hp = c.maxHp
          }
          cdTimer = c.specialCd
          events.push({ type: 'player_heal', amount: healed, specialName: c.specialName, playerHp: c.hp, playerMaxHp: c.maxHp })
        } else if (c.class !== 'Priest' && cdTimer === 0) {
          const [dmg, isCrit] = calcDamage(Math.floor(c.attack * c.specialMult), enemyDef.defense, c.critical)
          enemyHp -= dmg
          cdTimer = c.specialCd
          events.push({ type: 'player_attack', damage: dmg, isCrit, isSpecial: true, specialName: c.specialName, targetName: enemyDef.name, enemyHp: Math.max(0, enemyHp), enemyMaxHp: enemyDef.hp, playerHp: c.hp, playerMaxHp: c.maxHp })
        } else {
          const [dmg, isCrit] = calcDamage(c.attack, enemyDef.defense, c.critical)
          enemyHp -= dmg
          events.push({ type: 'player_attack', damage: dmg, isCrit, isSpecial: false, specialName: '', targetName: enemyDef.name, enemyHp: Math.max(0, enemyHp), enemyMaxHp: enemyDef.hp, playerHp: c.hp, playerMaxHp: c.maxHp })
        }

        if (cdTimer > 0) cdTimer--

        if (enemyHp <= 0) {
          events.push({ type: 'enemy_death', name: enemyDef.name })
          break
        }

        if (tick % 2 === 0) {
          const [eDmg, eCrit] = calcDamage(enemyDef.attack, c.defense, 5)
          c.hp -= eDmg
          if (c.hp < 0) c.hp = 0
          events.push({ type: 'enemy_attack', damage: eDmg, isCrit: eCrit, attackerName: enemyDef.name, playerHp: c.hp, playerMaxHp: c.maxHp })

          if (c.hp <= 0) {
            events.push({ type: 'player_death' })
            return events
          }
        }
      }
    }

    events.push({ type: 'room_complete', roomIndex: roomIdx, totalRooms: zone.rooms.length })
  }

  events.push({ type: 'loop_complete' })
  return events
}
```

- [ ] **Step 2: Create `client/src/__tests__/combat/CombatSimulator.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { simulateLoop } from '../../combat/CombatSimulator'
import type { CombatChar } from '../../combat/CombatSimulator'
import type { ZoneDef } from '../../types/api'

const strongWarrior: CombatChar = {
  hp: 1000, maxHp: 1000,
  attack: 200, defense: 50, critical: 0, class: 'Warrior',
  specialName: 'Brutal Strike', specialMult: 2.2, specialHeal: 0, specialCd: 5,
}

const weakChar: CombatChar = {
  hp: 5, maxHp: 5,
  attack: 1, defense: 0, critical: 0, class: 'Warrior',
  specialName: 'Brutal Strike', specialMult: 2.2, specialHeal: 0, specialCd: 5,
}

const oneEnemyZone: ZoneDef = {
  id: 'test', name: 'Test', min_level: 1,
  rooms: [{ xp: 10, gold: 5, enemies: [{ name: 'Goblin', hp: 30, attack: 3, defense: 0 }] }],
}

const twoRoomZone: ZoneDef = {
  id: 'test2', name: 'Test2', min_level: 1,
  rooms: [
    { xp: 10, gold: 5, enemies: [{ name: 'Goblin', hp: 5, attack: 1, defense: 0 }] },
    { xp: 15, gold: 8, enemies: [{ name: 'Wolf',   hp: 5, attack: 1, defense: 0 }] },
  ],
}

describe('simulateLoop', () => {
  it('first event is enemy_intro', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    expect(events[0]).toEqual({ type: 'enemy_intro', name: 'Goblin', hp: 30, maxHp: 30 })
  })

  it('last event is loop_complete when character survives', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    expect(events[events.length - 1]).toEqual({ type: 'loop_complete' })
  })

  it('last event is player_death when character cannot survive', () => {
    const events = simulateLoop(weakChar, oneEnemyZone)
    expect(events[events.length - 1]).toEqual({ type: 'player_death' })
  })

  it('enemy_death appears before room_complete', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const deathIdx = events.findIndex(e => e.type === 'enemy_death')
    const roomIdx  = events.findIndex(e => e.type === 'room_complete')
    expect(deathIdx).toBeGreaterThanOrEqual(0)
    expect(roomIdx).toBeGreaterThan(deathIdx)
  })

  it('emits room_complete once per room', () => {
    const events = simulateLoop(strongWarrior, twoRoomZone)
    const completions = events.filter(e => e.type === 'room_complete')
    expect(completions).toHaveLength(2)
  })

  it('player_attack enemyHp is never negative', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    for (const e of events) {
      if (e.type === 'player_attack') expect(e.enemyHp).toBeGreaterThanOrEqual(0)
    }
  })

  it('enemy_attack playerHp is never negative', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    for (const e of events) {
      if (e.type === 'enemy_attack') expect(e.playerHp).toBeGreaterThanOrEqual(0)
    }
  })

  it('special fires on first tick (cdTimer starts at 0)', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const first = events.find(e => e.type === 'player_attack')
    expect(first).toBeDefined()
    if (first?.type === 'player_attack') expect(first.isSpecial).toBe(true)
  })

  it('no special fires when cdTimer > 0 on tick 2', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const attacks = events.filter(e => e.type === 'player_attack')
    if (attacks.length >= 2 && attacks[1].type === 'player_attack') {
      expect(attacks[1].isSpecial).toBe(false)
    }
  })

  it('Priest emits player_heal when HP below half', () => {
    const priest: CombatChar = {
      hp: 5, maxHp: 200,
      attack: 200, defense: 50, critical: 0, class: 'Priest',
      specialName: 'Heal', specialMult: 1, specialHeal: 55, specialCd: 3,
    }
    const events = simulateLoop(priest, oneEnemyZone)
    const heals = events.filter(e => e.type === 'player_heal')
    expect(heals.length).toBeGreaterThan(0)
  })

  it('no events after loop_complete', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const idx = events.findIndex(e => e.type === 'loop_complete')
    expect(idx).toBe(events.length - 1)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd /home/gugu/work/development/idle-game/client
npm test
```

Expected: all CombatSimulator tests pass.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors in `combat/CombatSimulator.ts`.

- [ ] **Step 5: Commit**

```bash
git add client/src/combat/CombatSimulator.ts client/src/__tests__/combat/CombatSimulator.test.ts
git commit -m "feat(client): add CombatSimulator — CDR-only, port of Go combat engine"
```

---

## Task 7: TypeScript — `CombatVisualizer` (Phaser component)

**Files:**
- Create: `client/src/combat/CombatVisualizer.ts`

No unit tests — Phaser cannot run in happy-dom. Verified by typecheck + smoke test in Task 8.

Occupies expedition panel sub-area: `panelLeft=32, panelTop=218` (216×170 px within the 220×260 panel).

Internal layout (absolute world coords, panel at x=32, y=218):

| Element | Position |
|---|---|
| Room text | cx=140, y=223 |
| Status text | cx=140, y=234 |
| Enemy HP bar bg | cx=140, y=250, 200×6 |
| Enemy HP bar | same, fill |
| Enemy name | cx=140, y=260 |
| Enemy rect (sprite) | cx=168, y=305, 38×50 |
| Player rect (sprite) | cx=112, y=305, 34×50 |
| Player class initial | cx=112, y=305 |
| Player HP bar bg | cx=140, y=375, 200×6 |
| Player HP bar | same, fill |

- [ ] **Step 1: Create `client/src/combat/CombatVisualizer.ts`**

```typescript
import Phaser from 'phaser'
import type { Character, ZoneDef } from '../types/api'
import { simulateLoop } from './CombatSimulator'
import type { CombatChar, CombatEvent } from './CombatSimulator'

export class CombatVisualizer {
  private scene: Phaser.Scene
  private panelLeft: number
  private panelTop: number

  private roomText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private enemyHpBarBg!: Phaser.GameObjects.Rectangle
  private enemyHpBar!: Phaser.GameObjects.Rectangle
  private enemyNameText!: Phaser.GameObjects.Text
  private enemyRect!: Phaser.GameObjects.Rectangle
  private playerRect!: Phaser.GameObjects.Rectangle
  private playerLabel!: Phaser.GameObjects.Text
  private playerHpBarBg!: Phaser.GameObjects.Rectangle
  private playerHpBar!: Phaser.GameObjects.Rectangle

  private objects: Phaser.GameObjects.GameObject[] = []
  private timerEvent: Phaser.Time.TimerEvent | null = null
  private events: CombatEvent[] = []
  private eventIndex = 0
  private char: Character | null = null
  private zoneDef: ZoneDef | null = null
  private curEnemyHp = 0
  private curEnemyMaxHp = 1
  private curPlayerHp = 0
  private curPlayerMaxHp = 1

  constructor(scene: Phaser.Scene, panelLeft: number, panelTop: number) {
    this.scene = scene
    this.panelLeft = panelLeft
    this.panelTop = panelTop
  }

  start(char: Character, zoneDef: ZoneDef): void {
    this.stop()
    this.char = char
    this.zoneDef = zoneDef
    this.buildUI()
    this.runNextLoop()
  }

  stop(): void {
    if (this.timerEvent) { this.timerEvent.destroy(); this.timerEvent = null }
    for (const obj of this.objects) obj.destroy()
    this.objects = []
  }

  private ax(relX: number): number { return this.panelLeft + relX }
  private ay(relY: number): number { return this.panelTop + relY }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj)
    return obj
  }

  private buildUI(): void {
    const s = this.scene
    const barW = 200

    this.roomText = this.track(s.add.text(this.ax(108), this.ay(5), '', {
      font: '11px monospace', color: '#666666',
    }).setOrigin(0.5, 0))

    this.statusText = this.track(s.add.text(this.ax(108), this.ay(16), '', {
      font: '10px monospace', color: '#aaaaaa',
    }).setOrigin(0.5, 0))

    this.enemyHpBarBg = this.track(s.add.rectangle(this.ax(108), this.ay(32), barW, 6, 0x440000))
    this.enemyHpBar   = this.track(s.add.rectangle(this.ax(8 + barW / 2), this.ay(32), barW, 6, 0xcc2222))

    this.enemyNameText = this.track(s.add.text(this.ax(108), this.ay(42), '', {
      font: '11px monospace', color: '#ffaaaa',
    }).setOrigin(0.5, 0))

    this.enemyRect = this.track(s.add.rectangle(this.ax(136), this.ay(87), 38, 50, 0x5a0000).setStrokeStyle(1, 0xff4444))
    this.track(s.add.text(this.ax(136), this.ay(87), 'E', { font: '14px monospace', color: '#ff6666' }).setOrigin(0.5))

    this.playerRect = this.track(s.add.rectangle(this.ax(80), this.ay(87), 34, 50, 0x1a2a5e).setStrokeStyle(1, 0x4488ff))
    this.playerLabel = this.track(s.add.text(this.ax(80), this.ay(87), this.char?.class?.[0] ?? '?', {
      font: '14px monospace', color: '#88bbff',
    }).setOrigin(0.5))

    this.playerHpBarBg = this.track(s.add.rectangle(this.ax(108), this.ay(157), barW, 6, 0x004400))
    this.playerHpBar   = this.track(s.add.rectangle(this.ax(8 + barW / 2), this.ay(157), barW, 6, 0x22cc22))

    this.curPlayerHp    = this.char?.max_hp ?? 1
    this.curPlayerMaxHp = this.char?.max_hp ?? 1
    this.updateHpBars()
  }

  private toCombatChar(): CombatChar {
    const c = this.char!
    return {
      hp: c.max_hp, maxHp: c.max_hp,
      attack: c.attack, defense: c.defense, critical: c.critical,
      class: c.class,
      specialName: c.special_name, specialMult: c.special_mult,
      specialHeal: c.special_heal, specialCd: c.special_cd,
    }
  }

  private runNextLoop(): void {
    if (!this.char || !this.zoneDef) return
    this.events = simulateLoop(this.toCombatChar(), this.zoneDef)
    this.eventIndex = 0
    this.scheduleNext(300)
  }

  private scheduleNext(delay = 600): void {
    this.timerEvent = this.scene.time.addEvent({
      delay,
      callback: this.processNext,
      callbackScope: this,
    })
  }

  private processNext(): void {
    if (this.eventIndex >= this.events.length) { this.runNextLoop(); return }
    const event = this.events[this.eventIndex++]
    this.applyEvent(event)
    if      (event.type === 'player_death')  this.scheduleNext(2200)
    else if (event.type === 'loop_complete') this.runNextLoop()
    else                                     this.scheduleNext(600)
  }

  private applyEvent(event: CombatEvent): void {
    switch (event.type) {
      case 'enemy_intro':
        this.curEnemyHp    = event.hp
        this.curEnemyMaxHp = event.maxHp
        this.enemyNameText.setText(event.name)
        this.enemyRect.setFillStyle(0x5a0000)
        this.statusText.setStyle({ color: '#666666' }).setText('')
        this.updateHpBars()
        break

      case 'player_attack': {
        this.curEnemyHp  = event.enemyHp
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        const label = event.isSpecial ? `${event.specialName}!` : 'Attack'
        const color = event.isCrit ? '#ffff44' : '#aaaaaa'
        this.statusText.setStyle({ color }).setText(`${label}: ${event.damage}${event.isCrit ? ' CRIT!' : ''}`)
        this.floatText(this.ax(136), this.ay(60), `-${event.damage}`, event.isCrit ? '#ffff44' : '#ffffff')
        break
      }

      case 'player_heal':
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        this.statusText.setStyle({ color: '#44ff88' }).setText(`${event.specialName}: +${event.amount}`)
        this.floatText(this.ax(80), this.ay(60), `+${event.amount}`, '#44ff44')
        break

      case 'enemy_attack':
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        this.statusText.setStyle({ color: '#ff8866' }).setText(`${event.attackerName}: ${event.damage}${event.isCrit ? ' CRIT!' : ''}`)
        this.floatText(this.ax(80), this.ay(60), `-${event.damage}`, event.isCrit ? '#ff6644' : '#ff4444')
        break

      case 'enemy_death':
        this.enemyRect.setFillStyle(0x330000)
        this.statusText.setStyle({ color: '#888888' }).setText(`${event.name} defeated!`)
        break

      case 'room_complete':
        this.roomText.setText(`Room ${event.roomIndex + 1} / ${event.totalRooms}`)
        break

      case 'player_death':
        this.curPlayerHp = 0
        this.updateHpBars()
        this.playerRect.setFillStyle(0x440000)
        this.statusText.setStyle({ color: '#ff4444' }).setText('DEFEATED — respawning...')
        break

      case 'loop_complete':
        break
    }
  }

  private updateHpBars(): void {
    const barW = 200

    const ePct = this.curEnemyMaxHp > 0 ? Math.max(0, this.curEnemyHp / this.curEnemyMaxHp) : 0
    const eW   = Math.max(1, barW * ePct)
    this.enemyHpBar.setSize(eW, 6)
    this.enemyHpBar.setX(this.panelLeft + 8 + eW / 2)

    const pPct = this.curPlayerMaxHp > 0 ? Math.max(0, this.curPlayerHp / this.curPlayerMaxHp) : 0
    const pW   = Math.max(1, barW * pPct)
    this.playerHpBar.setSize(pW, 6)
    this.playerHpBar.setX(this.panelLeft + 8 + pW / 2)
  }

  private floatText(worldX: number, worldY: number, text: string, color: string): void {
    const t = this.scene.add.text(worldX, worldY, text, { font: '13px monospace', color }).setOrigin(0.5)
    this.scene.tweens.add({
      targets: t, y: worldY - 28, alpha: 0,
      duration: 900, ease: 'Power1',
      onComplete: () => t.destroy(),
    })
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/gugu/work/development/idle-game/client
npm run typecheck
```

Expected: 0 errors in `combat/CombatVisualizer.ts`.

- [ ] **Step 3: Commit**

```bash
git add client/src/combat/CombatVisualizer.ts
git commit -m "feat(client): add CombatVisualizer Phaser component"
```

---

## Task 8: Client — Integrate `CombatVisualizer` into `HubScene`

**Files:**
- Modify: `client/src/scenes/HubScene.ts`

Remove mana references. Replace static expedition panel with live `CombatVisualizer`. Collect button stops and restarts visualizer with updated character stats.

- [ ] **Step 1: Rewrite `client/src/scenes/HubScene.ts`**

```typescript
import Phaser from 'phaser'
import type { ExpeditionRun } from '../types/api'
import { startExpedition, collectExpedition } from '../api/expedition'
import { GameState } from '../state/GameState'
import { formatElapsed } from '../utils'
import { CombatVisualizer } from '../combat/CombatVisualizer'

export class HubScene extends Phaser.Scene {
  private elapsedText!: Phaser.GameObjects.Text
  private collectResultText!: Phaser.GameObjects.Text
  private cannotSurviveText!: Phaser.GameObjects.Text
  private timerEvent!: Phaser.Time.TimerEvent
  private visualizer: CombatVisualizer | null = null

  constructor() {
    super({ key: 'Hub' })
  }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) {
      this.scene.start('CharacterSelect')
      return
    }

    try {
      const run = await startExpedition(char.id, 'forest')
      GameState.instance.expeditionRun = run
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, { font: '14px monospace', color: '#ff4444' })
      return
    }

    this.buildUI()
  }

  private buildUI(): void {
    if (this.timerEvent) this.timerEvent.destroy()
    if (this.visualizer) { this.visualizer.stop(); this.visualizer = null }
    this.children.removeAll(true)

    const char = GameState.instance.character!
    const run  = GameState.instance.expeditionRun!
    const { width } = this.scale

    // Header
    this.add.rectangle(width / 2, 25, width, 50, 0x1a1a2e)
    this.add.text(20, 12, `${char.name}    ${char.class}    Lv.${char.level}`, {
      font: '16px monospace', color: '#ffffff',
    })

    this.buildExpeditionPanel(run)
    this.buildDungeonPanel()
    this.buildRaidPanel()

    // Nav buttons
    const sheetBtn = this.add.rectangle(200, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(200, 560, 'Character Sheet', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    sheetBtn.on('pointerover', () => sheetBtn.setFillStyle(0x445566))
    sheetBtn.on('pointerout',  () => sheetBtn.setFillStyle(0x334455))
    sheetBtn.on('pointerdown', () => { this.visualizer?.stop(); this.scene.start('CharacterSheet') })

    const switchBtn = this.add.rectangle(600, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(600, 560, 'Switch Character', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    switchBtn.on('pointerover', () => switchBtn.setFillStyle(0x445566))
    switchBtn.on('pointerout',  () => switchBtn.setFillStyle(0x334455))
    switchBtn.on('pointerdown', () => { this.visualizer?.stop(); this.scene.start('CharacterSelect') })

    this.timerEvent = this.time.addEvent({
      delay: 1000, callback: this.tickElapsed,
      callbackScope: this, loop: true,
    })
  }

  private buildExpeditionPanel(run: ExpeditionRun): void {
    const cx = 140

    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 188, 'Expedition', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 204, run.zone_name, { font: '13px monospace', color: '#ffffff' }).setOrigin(0.5)

    this.visualizer = new CombatVisualizer(this, 32, 218)
    this.visualizer.start(GameState.instance.character!, run.zone_def)

    this.elapsedText = this.add.text(cx, 395, `Time: ${formatElapsed(run.elapsed_seconds)}`, {
      font: '13px monospace', color: '#cccccc',
    }).setOrigin(0.5)

    this.cannotSurviveText = this.add.text(cx, 410, 'Cannot survive this zone!', {
      font: '11px monospace', color: '#ff8844',
    }).setOrigin(0.5).setVisible(false)

    this.collectResultText = this.add.text(cx, 410, '', {
      font: '11px monospace', color: '#88ff88',
    }).setOrigin(0.5)

    const collectBtn = this.add.rectangle(cx, 427, 140, 30, 0x225522)
      .setStrokeStyle(1, 0x44aa44).setInteractive({ useHandCursor: true })
    this.add.text(cx, 427, 'Collect', { font: '13px monospace', color: '#ffffff' }).setOrigin(0.5)
    collectBtn.on('pointerover', () => collectBtn.setFillStyle(0x336633))
    collectBtn.on('pointerout',  () => collectBtn.setFillStyle(0x225522))
    collectBtn.on('pointerdown', async () => {
      collectBtn.disableInteractive()
      try {
        const result = await collectExpedition(GameState.instance.expeditionRun!.id)
        if (result.cannot_survive) {
          this.cannotSurviveText.setVisible(true)
          this.collectResultText.setText('')
        } else {
          GameState.instance.character = result.character
          GameState.instance.expeditionRun = {
            ...GameState.instance.expeditionRun!,
            elapsed_seconds: 0,
          }
          this.cannotSurviveText.setVisible(false)
          this.collectResultText.setText(`+${result.xp_gained} XP  +${result.gold_gained} G`)
          this.elapsedText.setText(`Time: ${formatElapsed(0)}`)
          this.visualizer?.start(result.character, GameState.instance.expeditionRun!.zone_def)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error'
        this.collectResultText.setText('Error: ' + msg)
      }
      collectBtn.setInteractive({ useHandCursor: true })
    })
  }

  private buildDungeonPanel(): void {
    const cx = 400
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Dungeon', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'The Forsaken Crypt', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    this.add.rectangle(cx, 340, 160, 36, 0x333333).setStrokeStyle(1, 0x555555)
    this.add.text(cx, 340, 'Enter Dungeon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private buildRaidPanel(): void {
    const cx = 660
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Raid', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'Raid — Coming Soon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private tickElapsed(): void {
    const run = GameState.instance.expeditionRun
    if (!run) return
    run.elapsed_seconds += 1
    this.elapsedText.setText(`Time: ${formatElapsed(run.elapsed_seconds)}`)
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/gugu/work/development/idle-game/client
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/HubScene.ts
git commit -m "feat(client): live combat visualization in expedition panel"
```

---

## Task 9: Manual smoke test

- [ ] **Step 1: Start stack**

```bash
cd /home/gugu/work/development/idle-game
docker-compose up -d
```

```bash
cd client && npm run dev
```

- [ ] **Step 2: Smoke test checklist**

Open `http://localhost:5173` and verify:

1. Hub loads — expedition panel shows combat animation
2. Enemy name appears, HP bar starts full and drains as player attacks
3. Damage numbers float up (white for normal, yellow for CRIT)
4. After enemy dies → "X defeated!" → next enemy_intro → new name + full HP bar
5. Room counter increments "Room 1/3", "Room 2/3", "Room 3/3"
6. After room 3 → loop restarts from room 1 seamlessly
7. Warrior: "Brutal Strike!" appears on first attack, then basic attacks follow
8. Mage: "Fireball!" appears on first attack
9. Click **Collect** → reward text shows `+N XP +N G` → visualizer restarts with updated stats
10. Character too weak for zone → player HP bar hits 0 → "DEFEATED — respawning..." → 2.2s later restarts
11. Navigate to CharacterSheet → back to Hub → visualizer restarts cleanly

- [ ] **Step 3: Fix any layout issues found**

Adjust coordinates in `CombatVisualizer.ts` as needed. No logic changes.

- [ ] **Step 4: Commit if fixes applied**

```bash
git add client/src/combat/CombatVisualizer.ts
git commit -m "fix(client): adjust combat visualizer layout"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Remove mana, CDR-only | Tasks 1–3 Go + Task 5 TS types + Task 6 simulator |
| Server = single source of truth for zone data | Task 4 — `zone_def` in expedition response |
| Character sprite | Task 7 — `playerRect` + class initial |
| Enemy sprite | Task 7 — `enemyRect` |
| HP bars | Task 7 — fill rects with proportional width |
| Damage numbers | Task 7 — `floatText()` tween |
| Room progression | Task 7 — `roomText` on `room_complete` |
| Enemy progression | Task 7 — `enemyNameText` on `enemy_intro` |
| Death animation | Task 7 — red fill + "DEFEATED" |
| Respawn animation | Task 7 — 2.2s delay then `runNextLoop()` |
| Rewards remain server-side | Collect endpoint unchanged throughout |
| Visualization is cosmetic only | Simulator runs client-side only, no server state |

**Type consistency:** `CombatChar` defined in Task 6 `CombatSimulator.ts`, consumed in Task 7 `CombatVisualizer.ts` via `toCombatChar()`. `ZoneDef` defined Task 5, used Tasks 6+7+8. `special_cd` (not `special_cd_timer`) throughout — `cdTimer` is local simulation state only.
