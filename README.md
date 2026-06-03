# Idle Raid RPG

> Always evolve, even offline. When online, face challenges no single character can conquer alone.

A cooperative progression RPG built with Go + Phaser 3. Characters grow continuously through idle expeditions, tackle solo dungeons, and join real-time cooperative raids.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Phaser 3 + TypeScript |
| Backend | Go + WebSockets |
| Database | PostgreSQL |
| Cache | Redis |
| Infra | Docker Compose |

## Content Hierarchy

```
Expedition (idle, always running)
    ↓ pause
Dungeon (solo, instanced)
    ↓ return
Expedition (resumes)
    ↓ party up
Raid (3-player, real-time)
```

## Classes

| Class | Role |
|---|---|
| Warrior | Tank — absorbs damage |
| Mage | DPS — high damage, fragile |
| Priest | Support — heals allies |

## Running Locally

```bash
docker compose up -d        # start PostgreSQL
go run ./cmd/server         # start API server on :8080
```

Requires Go 1.25+ and Docker.

## Progress

| Milestone | Status |
|---|---|
| [001 — Persistent Character + Dungeon](docs/milestones/001_persistent_character_dungeon.md) | ✅ Complete |
| [002 — Expedition System](docs/milestones/002_expedition_system.md) | ✅ Complete |
| 003 — Phaser Client | 🚧 In Progress |
| 004 — Raid System | 📋 Planned |
| 005 — Auth | 📋 Planned |

## API

| Method | Path | Description |
|---|---|---|
| GET | /health | DB ping |
| POST | /accounts | Create account |
| POST | /characters | Create character |
| GET | /characters/:id | Character state |
| POST | /dungeon-runs | Run dungeon |
| GET | /dungeon-runs/:id | Run state |
| POST | /dungeon-runs/:id/claim | Claim rewards |
| POST | /expedition-runs | Start expedition |
| GET | /expedition-runs/:id | Status + elapsed |
| POST | /expedition-runs/:id/collect | Apply offline rewards |
| POST | /expedition-runs/:id/pause | Freeze time |
| POST | /expedition-runs/:id/resume | Unfreeze time |
| POST | /expedition-runs/:id/zone | Switch zone |
