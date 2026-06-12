# v6 Implementation Progress

Executing plans in `docs/superpowers/plans/2026-06-12-v6-slice*.md` (inline execution, no runtime smoke tests — user request to save tokens).

Branch: `feat/expedition-combat-visualization`

## Done (committed)

### Slice 1 — Item System ✓
- `000015_item_system_expansion.up.sql` — 6 slots, 4 rarities, crit/cdr/source columns
- `000016_seed_v6_items.up.sql` — 14 items
- `internal/character/items.go` — `EquippedBonus`, `ApplyEquipment` (caps: crit 80, cdr 50) + tests
- `cmd/server/handler_characters.go` — `loadEquipmentBonuses`, `loadCharEffective` (GET /characters/{id} returns effective stats)
- `cmd/server/handler_items.go` — GET inventory, GET equipped, POST/DELETE equipment/{slot}
- `cmd/server/handler_expeditions.go` — POST /expedition-runs/{id}/complete (**items by template NAME, not ID** — server resolves, skips unknown)
- Client: types in `api.ts`, `GameState` fields, `api/items.ts` + tests

### Slice 2 — Paper Doll ✓
- `client/src/combat/sprites.ts` — pixel grids (hero, slime, bat, skeleton, boss, 11 overlays)
- `client/src/scenes/BootScene.ts` — bakes textures (`spr_*`, `overlay_<name>`), kept char-loading logic
- `client/src/combat/PaperDollContainer.ts` — base + 4 visual layers (Weapon/Helmet/Armor/Boots); has setVisible/setAngle/angle/alpha accessors for tweens + tests

### Slice 3 — Skill Tree ✓
- `000017_skill_tree.up.sql` — skill_nodes (6 seeded), character_skill_nodes, characters.equipped_skill
- `internal/character/skills.go` — `SkillEffect` (with pgx `Scan`), `ApplyPassiveSkills`, `SkillPointsAvailable` + tests
- `loadCharEffective` now also applies passive skill effects
- `cmd/server/handler_skills.go` — GET skills, POST unlock, PUT equipped + routes
- Client: `api/skills.ts` + tests, `GameState.skills`, tabbed CharacterSheetScene (stats/inventory/skills)

### Slice 4 — Scenes ✓
- `client/src/scenes/BaseCombat.ts` — full combat engine (click-to-move, AI, whirlwind/charge, VFX, portals, packs, menu)
- `client/src/scenes/LobbyScene.ts` — camp, POIs (expedition/dungeon/shop/character), click-to-move
- `client/src/scenes/ExpeditionScene.ts` — zones/rooms, loot by name, reports via completeExpedition
- `client/src/scenes/DungeonScene.ts` — 6 rooms + boss, posts to `/dungeon-complete`
- `cmd/server/handler_dungeons.go` — `handleCompleteDungeon` (POST /dungeon-complete, items by name)
- `main.ts` — 960×540, all scenes; HubScene deleted; 'Hub' refs → 'Lobby'
- All client tests pass (39), go build OK

### Slice 5 — Presence ✓
- ✓ `nhooyr.io/websocket` dep added (go.mod/go.sum committed)
- ✓ `internal/presence/hub.go` + `client.go` committed
- `cmd/server/handler_presence.go` — GET `/ws/presence?char_id=` validates character, upgrades websocket, registers client
- `cmd/server/main.go` — server owns `presence.Hub`, route registered
- `client/src/net/PresenceSocket.ts` — connect/send/update/leave/disconnect wrapper + tests
- `client/src/scenes/LobbyScene.ts` — broadcasts hero position, renders other players with interpolation, cleans up on shutdown
- Verification: `go test ./...`, `go build ./...`, `npm run typecheck`, `npm run test`, `npm run build`

## TODO (continue here)

### Slice 6 — Raids (plan: `2026-06-12-v6-slice6-raids.md`, Tasks 28-31, NOT started)
1. `internal/raid/types.go` — message types
2. `internal/raid/engine.go` — 20Hz server-authoritative engine
3. `cmd/server/handler_raids.go` — POST /raid-runs, GET /ws/raid; server struct gets `raidsMu`+`raids map[string]*raid.Engine`
4. `client/src/net/raid-types.ts` + `RaidSocket.ts`
5. `client/src/scenes/RaidScene.ts` — renders server state; register in main.ts
6. LobbyScene raid POI (plan uses test fetch to /raid-runs)
Note: plan's raid engine references `sc.name`/`sc.c` from loadCharEffective — matches existing `serverChar` struct. Check `raid_runs` table schema (000009) before INSERT — plan assumes `(lobby_id, status)` columns.

### After all slices
- Run migrations against DB (just start server: `go run ./cmd/server`, needs `docker compose up -d` for Postgres)
- Manual smoke test (two tabs for presence)
- superpowers:finishing-a-development-branch (merge/PR decision)

## Known deviations from plans
- Item drops sent as template **names** (not IDs); both complete endpoints resolve name→id, skip unknown
- BaseCombat: `EnemyDef` renamed `CombatEnemyDef` (clash with api.ts type); skill icon glyphs replaced with ASCII
- LobbyScene shop close: teleports hero back to center to avoid POI re-trigger loop
- CharacterSheet inventory equip/unequip refreshes via `scene.restart()`
- No runtime/DB smoke tests run — only `go build`, `go test`, `tsc`, `vitest`
