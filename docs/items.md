# Items — Idle Raid RPG

## Equipment Slots

In the MVP the character has 3 equipment slots.

| Slot | Description |
|---|---|
| Helmet | Head equipment — bonuses mainly to Defense and HP |
| Armor | Body equipment — bonuses mainly to Defense and HP |
| Weapon | Hand equipment — bonuses mainly to Attack and Critical |

> Each class equips the same slots, but available items are class-specific.

---

## Rarities

| Rarity | Color | Description |
|---|---|---|
| Common | Gray | Frequent drop in expeditions. Base attributes |
| Rare | Blue | Drop in dungeons and advanced expeditions. Superior attributes |
| Epic | Purple | Exclusive drop in dungeons and raids. Best attributes in the MVP |

### Loot hierarchy by content

| Content | Common | Rare | Epic |
|---|---|---|---|
| Expedition Zone 1 | ✓ | — | — |
| Expedition Zone 2 | ✓ | ✓ | — |
| Expedition Zone 3 | ✓ | ✓ | — |
| Dungeon | — | ✓ | ✓ |
| Raid | — | — | ✓ |

> Dungeon and raid Epic items are exclusive — they do not drop in expeditions.

---

## Upgrade System

Equipment can be improved with gold.

### Upgrade levels

```
Base item → +1 → +2 → +3
```

Each level increases the item's attributes proportionally.

### Upgrade cost (reference)

| Level | Gold Cost |
|---|---|
| Base → +1 | Low |
| +1 → +2 | Medium |
| +2 → +3 | High |

> Exact values defined during balancing.

### Rules

- Upgrade does not change item rarity
- A Common +3 item is inferior to a base Rare item
- Upgrades are permanent and cannot be undone

---

## Potions

Potions are consumables bought with gold and used manually during dungeons and raids.

| Potion | Effect |
|---|---|
| HP Potion | Restores a fixed amount of HP immediately |
| Mana Potion | Restores a fixed amount of Mana immediately |

### Rules

- Potions are triggered manually by the player during combat
- The player carries a limited number of potions per dungeon/raid session
- Maximum potions per session will be defined during balancing

---

## Visible Equipment

The character's appearance changes when equipping items — Paper Doll system.

### Layer structure

```
Base body
  ↓ Armor
  ↓ Helmet
  ↓ Weapon
  ↓ Effects (critical, magic, etc.)
```

Each piece of equipment has its own sprite that is overlaid onto the character's base body.
