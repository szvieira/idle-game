# Paper Doll Spritesheet Design

**Date:** 2026-06-14
**Status:** WIP — brainstorming in progress

## Decisions made

### Art style
LPC (Liberated Pixel Cup) format — 64×64px per frame, 4 directions, multiple animation rows. Huge free ecosystem on OpenGameArt.org. License: CC-BY-SA (attribution required).

### Scope
Animated paper dolls in **all scenes** where characters appear: Lobby (idle loop), DungeonScene, RaidScene, CharacterSelectScene. Equipment changes reflect immediately on all layers.

### Equipment slots
Keep current 4 visual slots: **Weapon, Helmet, Armor, Boots**. Ring and Amulet remain stat-only (no visual layer).

### Integration approach
**Extend PaperDollContainer** — stacked sprites, synced animation (same pattern as Terraria, Stardew Valley).

Each character is a container of 5 Phaser sprites (base body + 4 equipment layers). All sprites play the same animation frame index simultaneously. Equipping an item swaps the texture on that slot's sprite. No runtime baking required.

---

## LPC sheet format

Standard sheet: **832×1344px**, 64×64 per frame, 13 columns.

| Row group | Animation      | Frames | Used            |
|-----------|---------------|--------|-----------------|
| 0–3       | Spellcast (4 dirs) | 7  | Mage attack     |
| 4–7       | Thrust (4 dirs)    | 8  | Paladin attack  |
| 8–11      | Walk (4 dirs)      | 9  | Idle loop       |
| 12–15     | Slash (4 dirs)     | 6  | Warrior attack  |
| 16–19     | Shoot (4 dirs)     | 13 | Skip (no ranged)|
| 20        | Hurt/Die (S)       | 6  | Death           |

**Default facing:** South (row index = animation_start + 2). Lobby uses walk-S (row 10) as idle loop.

---

## Asset files needed

```
client/public/assets/lpc/
  bodies/
    body_warrior.png      # heavy build, no armor
    body_mage.png         # slim build
    body_paladin.png      # medium build
  helmets/
    helmet_<name>.png     # one per helmet item
  armor/
    armor_<name>.png      # one per armor item
  boots/
    boots_<name>.png      # one per boots item
  weapons/
    weapon_<name>.png     # one per weapon item
```

All sheets: same 832×1344 canvas, same frame layout. Transparent outside the equipped slot area.

## Asset sources

- **Universal LPC Generator:** sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator — exports individual layers. Start here for base bodies.
- **OpenGameArt.org:** Search "LPC armor", "LPC helmet", "LPC weapon". Filter CC-BY-SA.

---

## PaperDollContainer rework (design TBD)

To be completed in next brainstorming section.

## Animation system (design TBD)

To be completed in next brainstorming section.

## Scene integration (design TBD)

To be completed in next brainstorming section.
