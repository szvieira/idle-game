# Vision — Idle Raid RPG

## Concept

A cooperative progression RPG with continuous growth, where characters evolve offline and the greatest challenges take place in real-time synchronized raids.

## One-sentence summary

> Always evolve, even offline. When online, face challenges no single character can conquer alone.

## Inspirations

| Reference | What it inspires |
|---|---|
| AFK Arena | Idle loop, offline progression, live visualization |
| Bit Heroes Quest | Dungeon structure, loot, rarities |
| Taskbar Hero | Simplicity of automatic combat |
| World of Warcraft | Concept of cooperative raids with defined roles |
| Chrono Trigger / FF6 | Pixel art visual aesthetic |

## Differentiators

- Progression always happens — online or offline
- Automatic combat with strategic configuration by the player
- Cooperative raids that require class composition
- Visible equipment on the character (Paper Doll)
- No open-world complexity — focus on the progression loop

## What the MVP needs to validate

- Is the idle loop satisfying? Does the player feel they progressed when they return?
- Is automatic combat fun to watch and configure?
- Does the dungeon have enough tension to justify playing online?
- Does the cooperative raid work with 3 synchronized players?
- Does the content hierarchy (Expedition → Dungeon → Raid) make sense?

## Platform

- Web (browser)
- Stack: Phaser 3 + TypeScript (frontend), Go + WebSockets (backend), PostgreSQL, Redis

## Planned versions

| Version | Scope |
|---|---|
| MVP | Idle + Solo Dungeon + 3-player Raid |
| v2 | Explorable dungeons with movement |
| v3 | Shared city, market, NPCs |
| v4 | Open world (if it makes sense) |
