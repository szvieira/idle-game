# Dungeon — Idle Raid RPG

## Concept

A dungeon is the game's instanced solo content. The player pauses the expedition, enters the dungeon, faces progressive rooms and a final boss, and receives exclusive rewards.

---

## Structure

```
Room 1 (common enemies)
    ↓
Room 2 (common enemies)
    ↓
Room 3 (common enemies)
    ↓
Room 4 (common enemies)
    ↓
Elite Room (elite enemy — stronger than common ones)
    ↓
Boss (dungeon boss)
```

---

## Enemies

| Type | Description |
|---|---|
| Common | Standard enemies in rooms 1 to 4. Attributes equivalent to the zone |
| Elite | A single stronger enemy with more HP and damage. Precedes the boss |
| Boss | Dungeon boss. High HP and damage. Main reward |

---

## Rules

- The player cannot pause or exit mid-dungeon without abandoning it
- If the character dies, the dungeon ends with no reward
- The dungeon can be repeated freely in the MVP
- Upon finishing (victory or defeat), the character automatically returns to the expedition

---

## Rewards

| Outcome | Rewards |
|---|---|
| Complete room | XP + Gold |
| Defeat Elite | XP + Gold + chance of Rare item |
| Defeat Boss | XP + Gold + guaranteed Rare or Epic item |

- Dungeon Rare and Epic items are exclusive — they do not drop in expeditions
- The boss has a higher chance of dropping an Epic

---

## MVP Dungeon

| Attribute | Value |
|---|---|
| Name | TBD |
| Recommended level | 10+ |
| Enemies | TBD in art phase |
| Boss | TBD in art phase |
| Exclusive loot | Rare and Epic items specific to this dungeon |

---

## Manual Interaction

During the dungeon the player can manually trigger:

| Action | Description |
|---|---|
| HP Potion | Restores HP immediately |
| Mana Potion | Restores Mana immediately |

The rest of the combat is automatic.
