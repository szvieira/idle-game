# Idle Raid — v6 Features Design

**Date:** 2026-06-12  
**Scope:** Item system expansion, paper doll, skill tree, full client scene rewrite  
**Approach:** Vertical slices — items first, then paper doll, then skill tree, then scene rewrite  

---

## 1. Overall Architecture

### Combat Models (three distinct systems)

| Context | Model | Notes |
|---|---|---|
| Lobby / open zones | Position broadcast relay | Players broadcast position every ~100–200ms. Server relays to others in same zone. Interpolated rendering. |
| Expedition / Dungeon (solo) | Client-authoritative | Client runs `CombatSimulator`. On session end: `POST /complete` with `{ xp, gold, items[] }`. Server persists. |
| Raids (multiplayer combat) | Server-authoritative | Server runs simulation. Clients send inputs, server ticks state at fixed rate and broadcasts to all players. |

### Key Principles

- `CombatSimulator` (already exists in `client/src/combat/`) drives all client-side combat logic
- Solo and lobby are low-complexity; raid complexity is scoped only to raids
- Server is a persistence layer for solo; a simulation authority for raids
- `PaperDollContainer` (new) is the shared visual component across all combat scenes

---

## 2. Item System Expansion

### Database Changes (new migration)

**`item_templates` additions:**
- `crit_bonus INT NOT NULL DEFAULT 0` — percentage points (5 = 5% crit)
- `cdr_bonus INT NOT NULL DEFAULT 0` — percentage points (10 = 10% CDR)
- `source TEXT NOT NULL CHECK (source IN ('expedition', 'dungeon'))`
- Expand `slot` CHECK: add `'Boots'`, `'Ring'`, `'Amulet'`
- Expand `rarity` CHECK: add `'Uncommon'`

**`equipment` table:**
- Expand `slot` CHECK to match all 6 slots: `'Helmet','Armor','Weapon','Boots','Ring','Amulet'`

**New seed migration — full item set (English names):**

| Item | Slot | Rarity | Source | Stats |
|---|---|---|---|---|
| Iron Sword | Weapon | Common | expedition | +4 ATK |
| Leather Chestplate | Armor | Common | expedition | +14 HP, +1 DEF |
| Leather Boots | Boots | Common | expedition | +8 HP |
| Copper Ring | Ring | Common | expedition | +2 ATK |
| Soldier's Sword | Weapon | Uncommon | expedition | +8 ATK, +2% CRIT |
| Scout's Helm | Helmet | Uncommon | expedition | +18 HP, +2 DEF |
| Quartz Amulet | Amulet | Uncommon | expedition | +5% CDR |
| Crypt Blade | Weapon | Rare | dungeon | +14 ATK, +5% CRIT |
| Watcher's Helm | Helmet | Rare | dungeon | +30 HP, +4 DEF |
| Sepulchral Ring | Ring | Rare | dungeon | +6 ATK, +5% CDR |
| Silent Boots | Boots | Rare | dungeon | +20 HP, +4% CRIT |
| Crypt Lord's Mantle | Armor | Epic | dungeon | +60 HP, +8 DEF |
| Profane Axe | Weapon | Epic | dungeon | +24 ATK, +8% CRIT |
| Crown of Bones | Helmet | Epic | dungeon | +40 HP, +10% CDR |

### Backend Changes

- `EffectiveStats(char Character, items []ItemTemplate) Character` — sums all equipped item bonuses onto base stats. Called wherever character stats are returned to client.
- `POST /characters/:id/expedition/complete` — body `{ xp int, gold int, items []string }` (item template IDs). Server validates character owns an active expedition run, persists results, adds items to inventory, marks expedition run as completed.
- `POST /characters/:id/dungeon/complete` — same shape.
- Equip/unequip endpoints already exist — extend slot validation to cover all 6 slots.

### Client Changes

- `types/api.ts`: add `ItemTemplate`, `InventoryItem`, `EquippedSlots` types
- `GameState`: add `inventory: InventoryItem[]`, `equipped: EquippedSlots` — refreshed after equip calls and after complete calls
- `CharacterSheetScene` inventory tab: scrollable item grid, rarity color coding, click to equip/unequip

---

## 3. Paper Doll

### Approach

Separate Phaser sprite layers stacked on hero sprite. Each slot = one independent `Phaser.GameObjects.Image` at same position as hero, higher depth. Swap texture on equip, hide on unequip.

### Sprite Definitions

- Port `SPRITES` and `OVERLAYS` pixel art grids from prototype into `client/src/combat/sprites.ts` as TypeScript constants
- `buildTexture(scene, key, gridDef)` — generates canvas texture from pixel grid. Called once in `BootScene` at startup.
- Ring and Amulet slots have no visual overlay (stat-only items) — no layer for those slots

### `PaperDollContainer` Class (`client/src/combat/PaperDollContainer.ts`)

```
PaperDollContainer
  - container: Phaser.GameObjects.Container
  - baseSprite: Image          (hero base)
  - layers: Map<slot, Image>   (weapon, helmet, chest, boots)
  + equip(slot, itemId): void  — sets layer texture
  + unequip(slot): void        — hides layer
  + moveTo(x, y): void         — moves container (all layers follow)
  + playAnim(name): void       — triggers animation on container
```

- Used in `CharacterSheetScene` (static preview), `ExpeditionScene`, `DungeonScene`, `RaidScene`
- Animations applied to container — all layers move as a unit

---

## 4. Skill Tree

### Database Changes (new migration)

```sql
CREATE TABLE skill_nodes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('active', 'passive')),
  requires_id TEXT REFERENCES skill_nodes(id),
  effect      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE character_skill_nodes (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  node_id      TEXT NOT NULL REFERENCES skill_nodes(id),
  PRIMARY KEY (character_id, node_id)
);

ALTER TABLE characters ADD COLUMN equipped_skill TEXT NOT NULL DEFAULT 'whirlwind';
```

**Seed — 6 nodes:**

| ID | Name | Type | Requires | Effect |
|---|---|---|---|---|
| whirlwind | Whirlwind | active | — | AoE skill (starting) |
| brute_force | Brute Force | passive | whirlwind | `{ atk_pct: 10 }` |
| fury | Fury | passive | brute_force | `{ crit: 5 }` |
| charge | Charge | active | fury | Single-target dash skill |
| iron_skin | Iron Skin | passive | whirlwind | `{ hp_pct: 15 }` |
| vigor | Vigor | passive | iron_skin | `{ def: 4 }` |

### Backend

- `GET /characters/:id/skills` — returns `{ unlocked: string[], equipped: string, available_points: int }`
- `POST /characters/:id/skills/:nodeId/unlock` — validates prerequisite unlocked + points available. Persists to `character_skill_nodes`.
- `PUT /characters/:id/skills/equipped` — validates node type is `active` + node is unlocked. Updates `characters.equipped_skill`.
- Skill points formula: `level - 1 - (count of unlocked nodes excluding whirlwind)`
- `EffectiveStats` applies passive node effects on top of item bonuses

### Client

- Skills tab in `CharacterSheetScene`
- Tree rendered with connector lines between nodes (Phaser Graphics)
- Node states: locked (gray), available (highlighted border), unlocked (lit), equipped (gold border)
- Active nodes show "Equip" button when unlocked
- Available point count shown at top of tab

---

## 5. Scene Structure (Client Rewrite)

### Scene Map

| Scene | Key | Replaces |
|---|---|---|
| `LobbyScene` | `'Lobby'` | `HubScene` |
| `ExpeditionScene` | `'Expedition'` | — (new) |
| `DungeonScene` | `'Dungeon'` | — (new) |
| `RaidScene` | `'Raid'` | — (new) |
| `CharacterSheetScene` | `'CharacterSheet'` | existing (full rewrite) |
| `BaseCombat` | — | abstract base class |

### `BaseCombat` (abstract, `client/src/scenes/BaseCombat.ts`)

Port from prototype. Provides:
- Arena rendering (tiled floor, torches, background tint per zone)
- HUD: HP bar, MP bar, skill cooldown indicator, gold/XP display
- Float damage numbers
- Potion use (HP/MP)
- `PaperDollContainer` integration
- Click-to-move input handling

### `LobbyScene`

- Character stats panel (name, level, power score)
- Zone picker → launches `ExpeditionScene` with zone config
- Dungeon button → launches `DungeonScene`
- Raid button → joins/creates lobby → launches `RaidScene`
- Shop panel: buy HP/MP potions (API call, deducts gold)
- Button → `CharacterSheetScene`
- Other players rendered as sprites (presence system — position broadcast over WebSocket)

### `ExpeditionScene` (extends `BaseCombat`)

- Hero rendered via `PaperDollContainer`, click-to-move
- Enemies spawn per zone definition (type, count, stats)
- `CombatSimulator` drives damage calculations and skill logic
- Loot rolled client-side on enemy kill (from zone's item pool)
- Session end (hero death or manual exit): `POST /expedition/complete { xp, gold, items[] }` → back to Lobby

### `DungeonScene` (extends `BaseCombat`)

- Same structure as `ExpeditionScene`
- Room-based: clear all enemies → next room button appears
- Harder enemies, Rare/Epic loot pool only
- Session end: `POST /dungeon/complete { xp, gold, items[] }`

### `RaidScene` (extends `BaseCombat`)

- Server-authoritative: inputs sent over WebSocket, server ticks game state
- Client sends: `{ type: 'raid:input', payload: { kind: 'move_to'|'skill', x?, y? } }`
- Server sends: `{ type: 'raid:state', state: GameStateTick }` at fixed tick rate
- Other players rendered via their own `PaperDollContainer` instances
- Boss mechanics controlled by server

### `CharacterSheetScene` (full rewrite, 3 tabs)

**Stats tab:**
- `PaperDollContainer` centered
- 6 equipment slot boxes arranged around paper doll
- Stat block: HP, ATK, DEF, CRIT, CDR — shows effective stats (base + items + skills)

**Inventory tab:**
- Scrollable grid of owned items
- Rarity color coding (gray/green/blue/purple)
- Click item → equip (if slot empty) or show swap confirmation
- Currently equipped items highlighted

**Skills tab:**
- Skill tree nodes laid out per tree structure
- Connector lines via `Phaser.GameObjects.Graphics`
- Node states: locked / available / unlocked / equipped
- Click available node → unlock (costs 1 skill point)
- Click unlocked active node → equip as active skill

---

## 6. WebSocket Protocol

### Presence (Lobby / Zones)

```
client → server:  { type: 'presence:pos', x: number, y: number, anim: string }
server → clients: { type: 'presence:update', players: [{ id, name, x, y, anim }] }
server → clients: { type: 'presence:leave', playerId: string }
```
Broadcast interval: ~150ms

### Raid Combat

```
client → server:  { type: 'raid:input', payload: { kind: 'move_to', x: number, y: number } }
client → server:  { type: 'raid:input', payload: { kind: 'skill' } }
server → clients: { type: 'raid:state', tick: number, players: [...], enemies: [...] }
server → clients: { type: 'raid:start', raidId: string, players: [...] }
server → clients: { type: 'raid:end', outcome: 'victory'|'defeat', rewards: [...] }
```
Server tick rate: 20 Hz (50ms) — configurable via env var

---

## 7. Implementation Order (Vertical Slices)

1. **Slice 1 — Item system expansion**: DB migrations + seed, `EffectiveStats`, complete endpoints, client types + GameState, CharacterSheet inventory tab
2. **Slice 2 — Paper doll**: `sprites.ts`, `PaperDollContainer`, integrate into CharacterSheet stats tab
3. **Slice 3 — Skill tree**: DB + seed, skill endpoints, CharacterSheet skills tab
4. **Slice 4 — Scene rewrite**: `BaseCombat`, `LobbyScene`, `ExpeditionScene`, `DungeonScene`, `CharacterSheetScene` full rewrite
5. **Slice 5 — Presence system**: WebSocket presence protocol, lobby player rendering
6. **Slice 6 — Raids**: Server-authoritative combat, `RaidScene`, WS raid protocol

Each slice is independently mergeable. Slices 1–4 have no multiplayer dependency.
