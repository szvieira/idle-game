# Raid — Idle Raid RPG

## Concept

A raid is the game's cooperative content. Three players, each with a different class, face together content that is impossible to complete solo. It is the greatest challenge and the greatest reward in the MVP.

---

## Composition

The raid requires exactly 3 players, one of each class.

| Slot | Class | Role |
|---|---|---|
| 1 | Warrior | Tank — absorbs group damage |
| 2 | Mage | DPS — maximizes damage dealt |
| 3 | Priest | Support — keeps the group alive |

---

## Lobby System

```
Player A creates room → receives room code
Player A shares the code with B and C
Players B and C join with the code
Room displays all 3 classes and each player's status
When all 3 are ready → raid begins
```

- Only the room creator can start the raid
- The room waits indefinitely until all 3 players are ready
- No automatic matchmaking in the MVP

---

## Structure

```
Room 1 (common enemies)
    ↓
Room 2 (common enemies)
    ↓
Room 3 (common enemies)
    ↓
Elite Room (elite enemy)
    ↓
Raid Boss
```

The Raid Boss has more HP and damage than the solo dungeon boss, justifying the need for 3 players.

---

## Disconnection

If a player loses connection during the raid:

- The AI takes over the disconnected player's character
- The character continues fighting automatically with the class's default behavior
- The raid is not ended
- If the player reconnects, they resume control normally

---

## Manual Interaction

During the raid each player can manually trigger for their own character:

| Action | Description |
|---|---|
| HP Potion | Restores HP immediately |
| Mana Potion | Restores Mana immediately |

---

## Synchronization

The server is authoritative — all combat calculations happen on the server.

The server sends events to all clients:

```json
{
  "source": "mage",
  "skill": "fireball",
  "target": "boss",
  "damage": 320
}
```

Each client renders locally:
- Skill animation
- Damage number
- HP bar update

---

## Rewards

| Outcome | Rewards |
|---|---|
| Complete room | XP + Gold |
| Defeat Elite | XP + Gold + chance of Epic item |
| Defeat Boss | XP + Gold + guaranteed Epic item |

- Raid Epic items are the best in the MVP
- Each player receives their own loot — no item competition

---

## MVP Raid

| Attribute | Value |
|---|---|
| Name | TBD |
| Recommended level | 15+ |
| Players | 3 (Warrior, Mage, Priest) |
| Boss | TBD in art phase |
| Exclusive loot | Best Epics in the MVP |
