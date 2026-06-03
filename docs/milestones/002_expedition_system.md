# Milestone 002 — Expedition System

**Date:** 2026-06-02  
**Status:** Complete

## What was built

- `internal/expedition/` package: types, zones, loot, collect algorithm, stream stub
- Benchmark-and-extrapolate offline reward calculation using the real `RunCombat` engine
- Incremental level-up simulation: character stats update per level gained, benchmark re-runs
- `CannotSurvive` detection: weak characters earn nothing but time still drains
- Pause/resume time tracking via `accumulated_seconds` — pause time excluded from rewards
- Zone switch auto-collects current rewards in a single transaction
- 2 new migrations (000012, 000013): column renames, `accumulated_seconds`, Common item templates
- `combat.RoomStats.Ticks` added — lets expedition calculate loop duration from real combat

## Schema changes

Migration 000012:
- `expedition_runs.expedition_definition_id` → `zone_id`
- `expedition_runs.last_collected_at` → `last_activity_at`
- `expedition_runs.accumulated_seconds BIGINT` added

Migration 000013:
- 9 Common item templates seeded (Leather Cap, Cloth Hood, Worn Helm, etc.)

## Endpoints working

| Method | Path | Description |
|--------|------|-------------|
| POST | /expedition-runs | Start expedition (idempotent — returns existing run if active) |
| GET | /expedition-runs/:id | Status + elapsed seconds |
| POST | /expedition-runs/:id/collect | Apply offline rewards to character |
| POST | /expedition-runs/:id/pause | Freeze elapsed time |
| POST | /expedition-runs/:id/resume | Unfreeze elapsed time |
| POST | /expedition-runs/:id/zone | Auto-collect + switch zone (single transaction) |

## Reward calculation algorithm

```
O(levels gained) — independent of offline duration

1. Clone character (simulation never mutates DB state)
2. Probe benchmark: detect cannot-survive before main loop
3. Loop:
   a. Simulate one full zone loop (3 rooms × 3 enemies) via RunCombat
   b. completedLoops = floor(remaining / loop_seconds)
   c. Apply XP × completedLoops → check level-up
   d. If level-up: re-benchmark with new stats, continue
   e. Else: done
4. RollLoot(zone, totalCompletedLoops) — correct total across all segments
```

## Zones

| Zone | ID | Min Level | Enemies | Loops/Drop |
|------|----|-----------|---------|------------|
| Forest | `forest` | 1 | Goblin, Wolf, Goblin Archer | 10 |
| Ruins | `ruins` | 10 | Skeleton, Zombie, Stone Golem | 8 |
| Shadow Cavern | `shadow_cavern` | 18 | Giant Bat, Venomous Spider, Troll | 5 |

## Loot drops

- Zone 1: Common only
- Zone 2: 50% Common / 50% Rare
- Zone 3: Rare only

## Verified output

```json
{
  "cannot_survive": false,
  "xp_gained": 30,
  "gold_gained": 19,
  "levels_gained": 0,
  "elapsed_seconds": 10,
  "character": { "level": 10, "xp": 30, "gold": 19 },
  "loot": []
}
```

## Architecture decisions

- Rewards calculated at collect time only — no background jobs, no pending storage
- Clone-first invariant: `sim := *sc.c` before calling `Calculate`, original never mutated
- Zone switch uses single transaction — rewards + zone_id update commit atomically
- `CannotSurvive` returns 200 with flag, no DB writes — client surfaces the warning
- `stream.go` stub kept for future WebSocket live visualization

## Next

- Unit tests: `Calculate` pure function (fixed RNG seed, known inputs)
- Integration tests: full lifecycle, pause/resume time tracking, zone switch atomicity
- Raid lobby endpoints
- Auth (bcrypt + JWT) when Phaser client needs login
