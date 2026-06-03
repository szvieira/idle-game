# Expedition — Idle Raid RPG

## Concept

The expedition is the game's idle mode. The character is always in combat in an expedition zone, continuously evolving — even when the player is offline.

---

## Online vs Offline Behavior

### Online
- The player watches the character fighting live against waves of enemies
- Animations, damage, enemy HP, and rewards in real time
- Combat is calculated on the server and sent to the client via events

### Offline
- The server calculates progress based on time elapsed and the character's attributes
- Upon returning, the player receives a summary of accumulated rewards
- Base formula:

```
rewards = time_away × character_farm_rate
```

> The farm rate is derived from the character's attributes and current zone.

---

## Expedition Zones

The MVP has 3 zones, unlocked by level.

| Zone | Name | Requirement | Rewards |
|---|---|---|---|
| 1 | Forest | Available from the start | Low gold, Common items |
| 2 | Ruins | Level 10 | Medium gold, Common and Rare items |
| 3 | Shadow Cavern | Level 18 | High gold, Rare items |

The player manually chooses which zone to stay in. Harder zones give more rewards.

---

## Room Structure

Each zone is made up of rooms with waves of enemies in a continuous loop.

```
Room 1 (3 enemies)
    ↓ all defeated
Room 2 (3 enemies)
    ↓ all defeated
Room 3 (3 enemies)
    ↓ all defeated
Restart from the beginning
```

- When all enemies in a room are killed, the character advances automatically
- When the last room is completed, the loop restarts
- Each room defeat generates XP and gold

---

## Expedition Pauses

The expedition pauses automatically when the player enters a dungeon or raid.

```
Active expedition
    ↓ player enters dungeon
Expedition paused
    ↓ dungeon ends
Expedition resumes automatically
```

Pause time is not counted in the offline reward calculation.

---

## Expedition Enemies

Each zone has its own enemies with distinct visuals and attributes.

| Zone | Enemies (examples) |
|---|---|
| Forest | Goblin, Wolf, Goblin Archer |
| Ruins | Skeleton, Zombie, Stone Golem |
| Shadow Cavern | Giant Bat, Venomous Spider, Troll |

> Final names and visuals defined in the art phase.
