# Economy — Idle Raid RPG

## Currency

The MVP has a single currency: **Gold**.

---

## Gold Sources

| Source | Amount | Notes |
|---|---|---|
| Expedition | Low per hour | Constant, accumulates offline |
| Dungeon | Medium per run | Bonus on completion |
| Raid | High per run | Highest reward in the MVP |

---

## Gold Uses

### A — Buy Equipment from the NPC Vendor

- The vendor offers a selection of Common and some Rare items
- The selection rotates periodically
- Epic items are not available at the vendor — drop only

### B — Equipment Upgrade

Improves the attributes of an existing piece of equipment.

```
Item +0 → +1 → +2 → +3
```

Cost increases with each upgrade level.

### C — Buy Potions

| Potion | Cost |
|---|---|
| HP Potion | Low |
| Mana Potion | Low |

Potions are consumed during dungeons and raids.

### D — Build Reset

- Allows redistributing the character's attribute points
- Useful when the player wants to try a different build
- Has a gold cost to avoid consequence-free frequent resets

> Reset cost increases with character level.

---

## Balancing Principles

- Gold should never be so scarce that it blocks progression
- Gold should never be so abundant that loot becomes irrelevant
- The ideal loop: farm expedition → buy potions → run dungeon → drop item → upgrade → farm raid
