# Classes — Idle Raid RPG

## Overview

The MVP has 3 classes, each with a defined role in the group.

| Class | Role | Difficulty |
|---|---|---|
| Warrior | Tank — absorbs damage, protects the group | Easy |
| Mage | DPS — high damage, fragile | Medium |
| Priest | Support — heals and keeps the group alive | Hard |

---

## Attributes

All characters share the same base attributes, with different starting values per class.

| Attribute | Description |
|---|---|
| HP | Character's total health |
| Mana | Resource consumed by special skills |
| Attack | Base damage dealt by attacks |
| Defense | Reduction of damage received |
| Critical | Critical hit chance and damage multiplier |
| CDR | Cooldown Reduction — reduces skill recharge time |

### Base distribution per class (level 1)

| Attribute | Warrior | Mage | Priest |
|---|---|---|---|
| HP | High | Low | Medium |
| Mana | Medium | High | High |
| Attack | Medium | High | Low |
| Defense | High | Low | Medium |
| Critical | Low | Medium | Low |
| CDR | Low | Medium | High |

> Exact numerical values will be defined during the balancing phase.

---

## Skills

Each class has 2 skills: an automatic basic attack and a special skill with a cooldown.

### Warrior

| Skill | Type | Description |
|---|---|---|
| Basic Attack | Automatic | Constant physical attack on the target enemy |
| Brutal Strike | Special | High physical damage to a single target. Cooldown reduced by CDR |

**Behavior:** Uses Brutal Strike as soon as the cooldown expires.

---

### Mage

| Skill | Type | Description |
|---|---|---|
| Basic Attack | Automatic | Constant magic projectile at the target enemy |
| Fireball | Special | High magic damage to a single target. Cooldown reduced by CDR |

**Behavior:** Uses Fireball as soon as the cooldown expires.

---

### Priest

| Skill | Type | Description |
|---|---|---|
| Basic Attack | Automatic | Constant holy projectile at the target enemy |
| Heal | Special | Restores HP to a specific ally. Cooldown reduced by CDR |

**Behavior:** Configurable by the player via the conditions system.

---

## Behavior System — Priest

The player configures priority rules for the Heal skill.

### Rule structure

```
IF [condition] → Heal [target]
```

### Examples of available conditions in the MVP

| Condition | Example |
|---|---|
| Ally with lowest HP | IF ally with lowest HP → Heal |
| Specific ally below X% | IF Warrior below 50% HP → Heal Warrior |
| Any ally below X% | IF any ally below 40% HP → Heal |

### Rules

- The player can configure up to 3 conditions in priority order
- The first true condition is executed
- If no condition is true and the cooldown expired, the Priest heals the ally with the lowest HP by default
