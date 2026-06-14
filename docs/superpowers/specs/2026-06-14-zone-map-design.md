# Zone Map Design

**Date:** 2026-06-14  
**Status:** Approved

## Problem

Expedition always starts in Forest (zone 1), hardcoded. Players with higher-level characters have no way to choose their farming zone.

## Goal

Add a world-map zone picker between the expedition portal and the combat scene. Players select which zone to farm; existing combat is unchanged.

## User Flow

1. Player walks to expedition portal in Lobby → `ZoneMapScene` starts
2. World map renders with three zones positioned spatially
3. Zones unlocked by character level (MinLevel already on backend zones)
4. Player clicks an unlocked zone → `scene.start('Expedition', { zoneId })`
5. ExpeditionScene starts combat in the selected zone (room 1)

## Zones (existing backend data)

| ID             | Name          | MinLevel | Position on map |
|----------------|---------------|----------|-----------------|
| forest         | Forest        | 1        | Left            |
| ruins          | Ruins         | 10       | Center          |
| shadow_cavern  | Shadow Cavern | 18       | Right           |

## ZoneMapScene

- Full Phaser scene (`key: 'ZoneMap'`), dark world-map background (deep teal/navy)
- Winding path drawn between zone nodes (Graphics, dark gold color)
- Each zone node: glowing pulsing circle + zone name text + "Lv. X+" tag
  - Unlocked: full zone color, interactive, hand cursor
  - Locked: greyscale/desaturated, non-interactive, padlock label
- Hover (unlocked): brief zone description + enemy names shown in a small tooltip
- Click (unlocked): `this.scene.start('Expedition', { zoneId: zone.id })`
- Back button: returns to Lobby, calls `scene.start('Lobby')`
- Zone colors: Forest `0x5ec05e`, Ruins `0xcc8844`, Shadow Cavern `0x9966cc`

## ExpeditionScene changes

- Read `zoneId` from `this.scene.settings.data` in `create()`
- Map `zoneId` to starting zone number: `forest=1, ruins=2, shadow_cavern=3`
- Pass `zoneId` to `startExpedition(char.id, zoneId)` (already supports any zone ID)
- `ZONE_NAMES` and room progression unchanged — zones still advance sequentially after the starting zone

## LobbyScene changes

- Expedition POI `onEnter`: change `this.scene.start('Expedition')` to `this.scene.start('ZoneMap')`

## What does NOT change

- Combat system (BaseCombat, ExpeditionScene room/enemy logic)
- Backend expedition API
- Loot tables, XP scaling, portal progression
- All other lobby POIs

## Files touched

| File | Change |
|------|--------|
| `client/src/scenes/ZoneMapScene.ts` | New file |
| `client/src/scenes/LobbyScene.ts` | 1 line: POI target |
| `client/src/scenes/ExpeditionScene.ts` | Read zoneId from init data |
| `client/src/main.ts` | Register ZoneMapScene |
