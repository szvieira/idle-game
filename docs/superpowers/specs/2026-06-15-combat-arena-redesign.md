# Combat Arena Redesign

**Date:** 2026-06-15  
**Scope:** `BaseCombat`, `ExpeditionScene`, `DungeonScene`, `RaidScene`  
**Goal:** Eliminate cramped horizontal feel; give player more vertical space to move, dodge, and use skills.

---

## Problem

Current arena: `{ x1:50, y1:215, x2:910, y2:500 }` → 860×285px, aspect ratio 3:1  
Hero spawns at `x=130, y=360` — pushed into far left corner.  
Result: thin horizontal strip, no vertical depth, no room to maneuver.

---

## Design

### 1. Arena Dimensions

| | Before | After |
|---|---|---|
| `ARENA.y1` | 215 | 140 |
| Arena height | 285px | 360px |
| Aspect ratio | 3.0:1 | 2.4:1 |
| `x1`, `x2`, `y2` | unchanged | unchanged |

### 2. Hero Spawn

`buildHero()` in `BaseCombat`:
- **Before:** `x=130, y=360`
- **After:** `x=220, y=430`

Bottom-left quadrant, not corner. Player has open space ahead (right), space to retreat, and vertical room above.

### 3. Enemy Spawn Zone

`spawnPacks()` in `BaseCombat`:
- **Before:** `cx = Between(ARENA.x1+200, ARENA.x2-40)`, `cy = Between(ARENA.y1+30, ARENA.y2-30)`
- **After:** `cx = Between(ARENA.x1+250, ARENA.x2-40)`, `cy = Between(ARENA.y1+40, ARENA.y2-50)`

Enemies still flow from the right side but now spread across the full vertical range.

### 4. HUD Placement

**Top strip (y=0–140)** — no changes; zone/room text, gold, level, menu button already sit here.

**Bottom strip (y=500–540)** — consolidate HP/MP/XP bars:
- HP bar: `x=20, y=506, w=240, h=10`
- MP bar: `x=20, y=520, w=240, h=8`
- XP bar: `x=20, y=531, w=240, h=6`

**Skill button** — move from `bx=870, by=450` (inside arena) to `bx=W-60, by=H-25` (bottom-right strip):
- Ring radius: 44 → 22px
- Skill name label removed (too cramped); icon + MP cost label above only
- CD arc recentered on new position

**AUTO toggle** — move to `x=W-130, y=H-18`, same bottom strip.

The full 860×360px arena is clear of persistent UI.

### 5. Background (`buildArena()`)

- **Floor separator line** stays at `ARENA.y1` (y=140)
- **Subtle depth gradient** — 3 semi-transparent horizontal rects at top of floor (y=140–175) darkening downward
- **Tile size** increases from 44→52px (fewer tiles, less repetitive in taller space)
- **Debris count** increases from 8→14 random rects, using full new `y1→y2` range
- **Torches** move to `x=[120, 840]`, body at `y=85`, flame at `y=58` (above new floor line)

### 6. Affected Files

| File | Change |
|---|---|
| `BaseCombat.ts` | `ARENA.y1`, hero spawn coords, bar positions, skill button position/size, tile size, debris count, torch positions |
| `ExpeditionScene.ts` | None (inherits from BaseCombat) |
| `DungeonScene.ts` | None (inherits from BaseCombat) |
| `RaidScene.ts` | References `ARENA.y1` directly — inherits y1 change automatically; own background draw is minimal |

---

## Non-Goals

- No new art assets
- No camera zoom changes
- No enemy direction changes (still flow left from right)
- No ZoneMapScene changes
