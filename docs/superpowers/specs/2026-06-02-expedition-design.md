# Expedition System Specification v2

## Overview

Expeditions are persistent solo activities that continuously generate progression for a character.

A character assigned to an expedition zone will continuously clear rooms, defeat enemies, earn XP, obtain gold, and find items.

The expedition continues whether the player is:

* Online
* Offline
* Connected to the expedition screen
* Away from the game

When online, the player may observe expedition combat in real time.

When offline, no combat events are stored and rewards are calculated at collection time.

Both modes represent the same activity.

---

# Core Philosophy

Expeditions are simulations.

The simulation always exists.

The player may:

* Watch it
* Ignore it
* Leave and return later

Progress continues regardless.

---

# Goals

* Provide continuous character progression.
* Allow players to observe combat when desired.
* Allow progression while offline.
* Reuse the same combat engine used by dungeons and raids.
* Avoid background combat tick processing.
* Keep reward calculation deterministic and inexpensive.

---

# Non-Goals

The expedition system will NOT:

* Replay every combat tick while offline.
* Persist combat logs while offline.
* Store pending rewards.
* Store pending loot.
* Run scheduled reward generation jobs.
* Support multiplayer participation.

---

# Expedition Zones

The game contains three expedition zones.

Each zone contains:

* Three rooms
* Three enemy encounters per room

Structure:

Room 1

* Enemy A
* Enemy B
* Enemy C

Room 2

* Enemy D
* Enemy E
* Enemy F

Room 3

* Enemy G
* Enemy H
* Enemy I

After Room 3:

Loop back to Room 1.

Expeditions never end.

They continuously loop.

---

# Online Visualization

When the player opens the expedition screen:

* Combat events are streamed live.
* The current room is displayed.
* The current enemy is displayed.
* HP bars may be displayed.
* Loot drops may be displayed.
* XP gains may be displayed.

The expedition screen is a visualization layer.

Watching the expedition does not alter rewards.

Watching the expedition does not alter combat outcomes.

The expedition behaves identically whether observed or not.

---

# Offline Progression

When the player is offline:

* No combat events are generated.
* No combat logs are stored.
* No room state is persisted.

Only elapsed expedition time is tracked.

Rewards are calculated when the player collects.

---

# Package Structure

internal/expedition/

* zones.go

  * Zone definitions
  * Enemy compositions
  * Room layouts

* collect.go

  * Benchmark simulation
  * Offline reward calculation
  * Incremental level-up processing

* loot.go

  * Drop tables
  * Item generation

* stream.go

  * Live expedition event generation
  * Online combat visualization

* types.go

  * Shared expedition structures

cmd/server/

* handler_expeditions.go

internal/db/migrations/

* 000012_expedition_accumulated.up.sql

---

# Data Model

Table: expedition_runs

Columns:

* id
* character_id (UNIQUE)
* zone_id
* started_at
* last_activity_at
* accumulated_seconds
* status

Migration 000012:

```sql
ALTER TABLE expedition_runs
  RENAME COLUMN expedition_definition_id TO zone_id;

ALTER TABLE expedition_runs
  RENAME COLUMN last_collected_at TO last_activity_at;

ALTER TABLE expedition_runs
  ADD COLUMN accumulated_seconds BIGINT NOT NULL DEFAULT 0;
```

No additional tables are required.

Items are inserted directly into inventory_items during collection.

---

# Time Tracking

Active Expedition:

```
elapsed_seconds =
  accumulated_seconds +
  (now - last_activity_at)
```

Pause Expedition:

```
accumulated_seconds +=
  (now - last_activity_at)

last_activity_at = now

status = 'paused'
```

Resume Expedition:

```
last_activity_at = now

status = 'active'
```

Collect Rewards:

```
total_seconds =
  accumulated_seconds +
  (now - last_activity_at)
```

After successful collection:

```
accumulated_seconds = 0

last_activity_at = now
```

---

# Reward Calculation

Approach: Benchmark + Extrapolation

Procedure:

1. Clone the character — simulation never mutates the DB-loaded original.
2. Simulate one complete expedition loop using RunCombat().
3. Measure:
   * Loop duration (ticks × tick_duration)
   * XP per loop
   * Gold per loop
4. Calculate completed loops from elapsed time.
5. Apply rewards.
6. If XP causes a level-up:
   * Update character stats
   * Recalculate benchmark
   * Continue processing
7. Repeat until all elapsed time has been consumed.
8. If character cannot survive the initial benchmark: return CannotSurvive=true, no DB writes.

Complexity: O(levels gained) — independent of total offline duration.

---

# Loot Generation

Loot is generated per completed loop.

Total completed loops tracked across all segments (including post-level-up re-benchmarks).

For each `floor(totalLoops / zone.LoopsPerDrop)` items:

1. Roll slot (Helmet / Armor / Weapon).
2. Roll rarity based on zone:
   * Zone 1 (Forest): Common only
   * Zone 2 (Ruins): 50% Common, 50% Rare
   * Zone 3 (Shadow Cavern): Rare only
3. Insert directly into inventory_items on collect.

No pending reward storage exists.

---

# API Behavior

## Start Expedition

`POST /expedition-runs`

If an expedition already exists:

* Return current expedition.
* Operation is idempotent.

If zone is locked:

* Return HTTP 400.

## Pause Expedition

`POST /expedition-runs/{id}/pause`

If already paused:

* No-op.

## Resume Expedition

`POST /expedition-runs/{id}/resume`

If already active:

* No-op.

## Collect Rewards

`POST /expedition-runs/{id}/collect`

If paused:

* Return HTTP 400.

If character cannot survive zone:

* Return 200 with `cannot_survive: true`, no DB writes.

Otherwise:

* Calculate rewards on cloned character.
* Apply XP, gold, loot in single transaction.
* Reset accumulated time.
* Return collection result.

## Switch Zone

`POST /expedition-runs/{id}/zone`

Same zone:

* No-op.

Locked zone:

* HTTP 400.

Unlocked zone:

* Auto-collect current rewards and switch zone in a single transaction.
* Zone switch only visible if transaction commits.

---

# Future Extensions

This architecture supports:

* Additional expedition zones
* Additional enemy types
* Additional classes
* Additional loot tables
* Live WebSocket combat visualization
* Expedition leaderboards
* Expedition achievements

without requiring architectural changes.
