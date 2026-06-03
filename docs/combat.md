# Combat — Idle Raid RPG

## Overview

Combat is 95% automatic. The character acts on their own based on attributes, skills, and configured behaviors. The player only intervenes with potions and, in the case of the Priest, with heal condition configuration.

---

## Combat Model

| Aspect | Description |
|---|---|
| Automatic | Basic attack, skill usage, target selection |
| Configurable | Priest heal conditions |

---

## Combat Logic

### Damage Formula

```
Base damage  = Attacker's Attack
Variation    = influenced by character attributes (not purely random)
Final damage = Base damage × variation × (1 - Target_Defense / 100)
```

- Defense is a percentage — never zeroes damage, only reduces it
- A well-built character deals more consistent damage
- A suboptimal character has greater variation

### Critical

```
If critical chance is reached:
    Final damage = Final damage × critical multiplier
```

- Critical chance derived from the Critical attribute
- Critical multiplier to be defined during balancing

---

### Heal Formula

```
Heal = derived from Priest attributes + level + equipment
```

> Exact formula defined during balancing.

---

### Cooldown and CDR

```
Effective cooldown = Base cooldown × (1 - CDR / 100)
```

- Maximum CDR to be defined — avoid zero cooldown
- Minimum cooldown per skill to be defined during balancing

---

### Basic Attack

- Basic attack frequency to be defined during balancing
- Occurs automatically in a loop while enemies are alive

---

### Target Selection

- Warrior and Mage always attack the first living enemy in the list
- Upon killing the first, they automatically move to the next
- Priest heals the target defined in the player-configured conditions
- If no condition is true, heals the ally with the lowest HP

---

### Death and Defeat

**Expedition**
- If the character dies, they revive automatically after a few seconds
- Returns to the start of the current room — loses room progress
- No rewards are lost from already completed rooms

**Dungeon**
- If the character dies, the dungeon ends immediately
- The player receives partial rewards from already completed rooms
- The character returns to the expedition

**Raid**
- If a player dies, their character is out of combat
- The other players continue the raid normally
- When the last living character dies, the raid ends
- The group receives partial rewards from already completed rooms

---

## Notes

- The combat engine will be developed first as a terminal prototype (no interface)
- If the loop of entering, fighting, and receiving loot is satisfying in the terminal, the game has potential
- Numerical balancing will be iterative during testing
