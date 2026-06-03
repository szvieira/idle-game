# Milestone 001 — Persistent Character + Dungeon via REST API

**Date:** 2026-06-02  
**Status:** Complete

## What was built

- Go server (`cmd/server/`) with PostgreSQL on Docker Compose
- 11 migrations covering the full domain schema
- Package split: `internal/character`, `internal/combat`, `internal/dungeon`
- Combat engine runs server-side via `NopHandler` (no display layer)
- Full dungeon loop: run → persist → claim rewards

## Schema (16 tables)

```
accounts, characters, item_templates, inventory_items, equipment
dungeon_definitions, dungeon_runs, dungeon_participants, dungeon_rewards
expedition_definitions, expedition_runs
raid_definitions, raid_lobbies, raid_lobby_members, raid_runs
schema_migrations
```

## Endpoints working

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | DB ping |
| POST | /accounts | Create account (auth disabled for dev) |
| POST | /characters | Create character (no account required) |
| GET | /characters/:id | Get character state |
| POST | /dungeon-runs | Run dungeon server-side, persist rewards |
| GET | /dungeon-runs/:id | Get run state (outcome, rooms_cleared) |
| POST | /dungeon-runs/:id/claim | Apply XP/gold/loot to character |

## Verified output

```json
{
  "success": true,
  "character": { "level": 12, "gold": 150, "attack": 32, "hp": 300 },
  "loot": [{ "name": "Bone Staff", "rarity": "Rare", "slot": "Weapon" }]
}
```

## Architecture decisions

- Domain resources (dungeon-runs, expedition-runs, raid-lobbies) — not nested under characters
- Definitions (static) separate from runs (instances) — templates/instances pattern
- `dungeon_rewards.payload` JSONB — rewards computed at run time, claimed separately
- `account_id` nullable — auth added later without schema change
- Expedition: idle loop model (`last_collected_at` timestamp, no rewards table)

## Next

- `POST /expedition-runs` + `POST /expedition-runs/:id/collect`
- Raid lobby endpoints
- Auth (bcrypt + JWT) when Phaser client needs login
