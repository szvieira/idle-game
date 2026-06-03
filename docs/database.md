# Database — Idle Raid RPG

## Overview

Main database: PostgreSQL  
Cache: Redis (sessions, ongoing raids, active expedition state)

---

## Table Diagram

```
users ──────────────── characters ─────────────── equipment
                            │                          │
                            ├─── inventory ────────── items
                            │
                            ├─── expeditions
                            │
                            ├─── dungeon_runs
                            │
                            ├─── raid_members ──────── raids
                            │
                            └─── priest_conditions
```

---

## Tables

### users
Player account.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| email | VARCHAR UNIQUE | Login email |
| password_hash | VARCHAR | Encrypted password |
| created_at | TIMESTAMP | Creation date |

---

### characters
Characters created by the player. A user can have multiple characters.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| user_id | UUID FK → users | Character owner |
| name | VARCHAR | Character name |
| class | ENUM | warrior, mage, priest |
| level | INT | Current level (1–20) |
| xp | INT | Accumulated XP |
| xp_next_level | INT | XP required for next level |
| hp_current | INT | Current HP |
| gold | INT | Available gold |
| attr_points_available | INT | Undistributed attribute points |
| attr_hp | INT | Base max HP |
| attr_attack | INT | Base attack |
| attr_defense | INT | Base defense |
| attr_critical | INT | Base critical chance |
| attr_cdr | INT | Base CDR |
| created_at | TIMESTAMP | Creation date |

---

### items
Global catalog of all game items. Includes equipment and potions.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| name | VARCHAR | Item name |
| type | ENUM | equipment, potion |
| slot | ENUM | helmet, armor, weapon, null (for potions) |
| class | ENUM | warrior, mage, priest, all |
| rarity | ENUM | common, rare, epic, null (for potions) |
| effect | ENUM | null, hp (for potions) |
| effect_value | INT | Potion heal value, null for equipment |
| attr_hp | INT | HP bonus, null for potions |
| attr_attack | INT | Attack bonus, null for potions |
| attr_defense | INT | Defense bonus, null for potions |
| attr_critical | INT | Critical bonus, null for potions |
| attr_cdr | INT | CDR bonus, null for potions |
| drop_source | ENUM | expedition, dungeon, raid, shop |
| icon | VARCHAR | Item sprite path |

---

### inventory
Items owned by a character. Each row is an item instance.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| character_id | UUID FK → characters | Item owner |
| item_id | UUID FK → items | Catalog reference |
| upgrade_level | INT | Upgrade level (0–3), null for potions |
| quantity | INT | Quantity (used for potions, 1 for equipment) |
| acquired_at | TIMESTAMP | Acquisition date |

---

### equipment
Slots currently equipped by a character.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| character_id | UUID FK → characters | Owning character |
| slot | ENUM | helmet, armor, weapon |
| inventory_id | UUID FK → inventory | Item equipped in this slot |

> A character has at most 3 rows in this table — one per slot.

---

### expeditions
Expedition state for each character.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| character_id | UUID FK → characters | Character on expedition |
| zone | INT | Current zone (1, 2, or 3) |
| current_room | INT | Current room within the zone |
| status | ENUM | active, paused |
| last_updated_at | TIMESTAMP | Base for offline progress calculation |

> `last_updated_at` is updated on each combat event. The difference between now and this timestamp calculates offline progress.

---

### dungeon_runs
Dungeon instances in progress or finished.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| character_id | UUID FK → characters | Character in the dungeon |
| status | ENUM | in_progress, completed, failed |
| current_room | INT | Current room |
| rooms_completed | INT | Rooms already completed |
| started_at | TIMESTAMP | Run start |
| finished_at | TIMESTAMP | Run end |

---

### raids
Raid instances — created by the lobby.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| code | VARCHAR UNIQUE | Room invite code |
| status | ENUM | waiting, in_progress, completed, failed |
| current_room | INT | Current room |
| rooms_completed | INT | Rooms already completed |
| created_at | TIMESTAMP | Creation date |
| started_at | TIMESTAMP | Raid start |
| finished_at | TIMESTAMP | Raid end |

---

### raid_members
Characters participating in a raid.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| raid_id | UUID FK → raids | Associated raid |
| character_id | UUID FK → characters | Participating character |
| status | ENUM | alive, dead, disconnected |
| joined_at | TIMESTAMP | Moment of joining the room |

> Maximum 3 rows per raid — one per class.

---

### priest_conditions
Behavior rules configured by the player for the Priest.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| character_id | UUID FK → characters | Priest who owns the rules |
| priority | INT | Evaluation order (1, 2, or 3) |
| condition_type | ENUM | ally_lowest_hp, ally_below_percent, class_below_percent |
| condition_value | INT | Condition value (e.g. 40 for 40% HP) |
| target | ENUM | warrior, mage, priest, lowest_hp |

---

### npc_shop
Items available at the NPC vendor. Selection rotates periodically.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique identifier |
| item_id | UUID FK → items | Available item |
| price | INT | Price in gold |
| stock | INT | Available quantity (null = unlimited) |
| available_from | TIMESTAMP | Start of availability |
| available_until | TIMESTAMP | End of availability — null = permanent |

> Shop rotation is controlled by the `available_from` and `available_until` fields. A periodic job populates new entries when the current selection expires.

---

## Redis

Redis stores volatile state that requires fast access and does not need permanent persistence.

| Key | Content | TTL |
|---|---|---|
| `session:{user_id}` | Authenticated session token | 24h |
| `expedition:{character_id}` | Current real-time expedition state | No TTL |
| `raid:{raid_id}` | Full state of the ongoing raid | Raid duration |
| `raid:lobby:{code}` | Lobby state waiting for players | 1h |
