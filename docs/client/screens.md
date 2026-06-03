# Client Screens — Idle Raid RPG

## Navigation Flow

```
App load
  └─ GET /characters
      ├─ none found → Character Create
      └─ found → Character Select
           ├─ pick character → Hub
           └─ "Create New" → Character Create

Character Create → Hub
Hub
  ├─ Expedition panel → (Client 2) Expedition screen
  ├─ Dungeon panel → (Client 3) Dungeon screen
  ├─ Raid panel → "Coming Soon"
  └─ Character sheet button → Character Sheet
Character Sheet → back to Hub
```

---

## Screens

### Character Select

Displayed when at least one character exists for the current session.

**Contents:**
- List of character cards, each showing:
  - Name
  - Class (Warrior / Mage / Priest)
  - Level
- "Create New" button

**Actions:**
- Click card → load character → navigate to Hub
- Click "Create New" → navigate to Character Create

---

### Character Create

Displayed on first load (no characters) or when the player chooses to create a new one.

**Contents:**
- Name text input
- 3 class cards, each showing:
  - Class name
  - Role (Tank / DPS / Support)
  - Short description
- Confirm button (disabled until name is filled and class selected)

**Actions:**
- Select class card → highlight selection
- Fill name → enable confirm
- Confirm → POST /characters → navigate to Hub

---

### Hub

Main screen after a character is loaded.

**Header:**
- Character name
- Class
- Level

**Expedition Panel:**
- Zone name
- Elapsed time (ticking up if active, frozen if paused)
- Estimated XP and gold accumulated since last collect
- Collect button
- Cannot-survive warning (shown when `cannot_survive: true` after collect)
- Zone switch controls (Client 2)

**Dungeon Panel:**
- Dungeon name ("The Forsaken Crypt")
- "Enter Dungeon" button

**Raid Panel:**
- Label: "Coming Soon"

**Navigation:**
- Character sheet button → Character Sheet screen
- Switch character button → Character Select screen

---

### Character Sheet

Full character stats and equipment overview.

**Contents:**
- Stats: Level, XP / XP to next, Gold, HP, Max HP, Mana, Max Mana, Attack, Defense, Critical, CDR
- Equipment slots: Helmet, Armor, Weapon (show equipped item name + rarity, or "Empty")
- Back button → Hub

---

## Client Milestones

| Milestone | Screens |
|-----------|---------|
| Client 1 | Character Select, Character Create, Hub (static panels), Character Sheet |
| Client 2 | Expedition screen (live visualization), Hub expedition panel fully interactive |
| Client 3 | Dungeon screen (run, watch combat, claim rewards) |
| Client 4 | Raid screen (lobby + 3-player synchronized combat) |

---

## Deferred

- Auth / login screen (no account system in MVP client)
- Inventory screen (items visible in equipment slots only)
- Settings / options screen
