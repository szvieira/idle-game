# Combat Arena Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the combat arena from a 860×285px horizontal strip to a 860×360px playfield with hero spawning in the bottom-left quadrant, and move all persistent HUD elements out of the arena.

**Architecture:** All changes are confined to `client/src/scenes/BaseCombat.ts`. The `ARENA` constant is exported and used by `RaidScene` directly — changing `y1` there propagates automatically. `DungeonScene` and `ExpeditionScene` inherit `buildArena()` and `buildHero()` from `BaseCombat` so they inherit all changes with no edits.

**Tech Stack:** Phaser 3, TypeScript, Vitest (typecheck only — Phaser scenes cannot be unit-tested without a canvas)

---

## File Map

| File | Change |
|---|---|
| `client/src/scenes/BaseCombat.ts` | All changes — arena constant, hero spawn, HUD bars, skill button, buildArena() visuals |

No other files need editing.

---

### Task 1: Expand arena and reposition hero spawn

**Files:**
- Modify: `client/src/scenes/BaseCombat.ts:8` (ARENA constant)
- Modify: `client/src/scenes/BaseCombat.ts:140,155,158` (buildHero)

- [ ] **Step 1: Change ARENA.y1**

In `BaseCombat.ts` line 8, change:
```typescript
export const ARENA = { x1: 50, y1: 215, x2: 910, y2: 500 }
```
to:
```typescript
export const ARENA = { x1: 50, y1: 140, x2: 910, y2: 500 }
```

- [ ] **Step 2: Reposition hero spawn in buildHero()**

In `BaseCombat.ts` line 140, change:
```typescript
const doll = new PaperDollContainer(this, 130, 360, char.class)
```
to:
```typescript
const doll = new PaperDollContainer(this, 220, 430, char.class)
```

In `BaseCombat.ts` lines 155–158, change:
```typescript
      x: 130, y: 360,
      dollOffX: 0, dollOffY: 0,
      doll,
      shadow: this.add.ellipse(130, 392, 50, 12, 0x000000, 0.35).setDepth(1),
```
to:
```typescript
      x: 220, y: 430,
      dollOffX: 0, dollOffY: 0,
      doll,
      shadow: this.add.ellipse(220, 462, 50, 12, 0x000000, 0.35).setDepth(1),
```

- [ ] **Step 3: Update enemy spawn zone in spawnPacks()**

In `BaseCombat.ts` lines 785–786, change:
```typescript
        cx = Phaser.Math.Between(ARENA.x1+200, ARENA.x2-40)
        cy = Phaser.Math.Between(ARENA.y1+30, ARENA.y2-30)
```
to:
```typescript
        cx = Phaser.Math.Between(ARENA.x1+250, ARENA.x2-40)
        cy = Phaser.Math.Between(ARENA.y1+40, ARENA.y2-50)
```

- [ ] **Step 4: Typecheck**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/BaseCombat.ts
git commit -m "feat: expand arena y1 140, reposition hero spawn, spread enemy spawn vertically"
```

---

### Task 2: Move HUD bars and skill cooldown arc to bottom strip

**Files:**
- Modify: `client/src/scenes/BaseCombat.ts:299-302,313` (baseUpdate)

- [ ] **Step 1: Reposition HP/MP/XP bars**

In `BaseCombat.ts` lines 299–302, change:
```typescript
    this.drawBar(this.heroHudHp, 20, H-72, 240, 14, h.hp/h.maxHp, 0x5ec05e)
    this.drawBar(this.heroHudMp, 20, H-52, 240, 10, h.mp/h.maxMp, 0x4da3ff)
    const char = GameState.instance.character!
    this.drawBar(this.heroHudXp, 20, H-36, 240, 6, char.xp/char.xp_to_next, 0xffd34d)
```
to:
```typescript
    this.drawBar(this.heroHudHp, 20, H-34, 240, 10, h.hp/h.maxHp, 0x5ec05e)
    this.drawBar(this.heroHudMp, 20, H-20, 240, 8,  h.mp/h.maxMp, 0x4da3ff)
    const char = GameState.instance.character!
    this.drawBar(this.heroHudXp, 20, H-9,  240, 6,  char.xp/char.xp_to_next, 0xffd34d)
```

- [ ] **Step 2: Reposition skill cooldown arc**

In `BaseCombat.ts` line 313, change:
```typescript
      this.skillCdArc.slice(W-90, H-90, 44, -Math.PI/2, -Math.PI/2 + frac*Math.PI*2, false)
```
to:
```typescript
      this.skillCdArc.slice(W-60, H-25, 22, -Math.PI/2, -Math.PI/2 + frac*Math.PI*2, false)
```

- [ ] **Step 3: Typecheck**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/BaseCombat.ts
git commit -m "feat: move HP/MP/XP bars and skill arc to bottom strip"
```

---

### Task 3: Resize and reposition skill button and AUTO toggle

**Files:**
- Modify: `client/src/scenes/BaseCombat.ts:196-216` (buildCoreHUD)

- [ ] **Step 1: Replace skill button block**

In `BaseCombat.ts` lines 196–216, replace the entire block:
```typescript
    const bx = W-90, by = H-90
    this.skillCdArc = this.add.graphics()
    this.skillMpLbl = this.add.text(bx, by-34, this.skill.mpCost+' MP', this.font(7,'#7fd4ff')).setOrigin(0.5)
    const ring = this.add.circle(bx, by, 44, 0x241c2e).setStrokeStyle(4, 0xffd34d)
    const icon = this.add.text(bx, by-6, this.skill.type === 'aoe' ? '*' : '>', this.font(26,'#7fd4ff')).setOrigin(0.5)
    const lbl  = this.add.text(bx, by+28, this.skill.name, this.font(7)).setOrigin(0.5)
    this.skillBtn = this.add.container(0, 0, [ring, icon, lbl, this.skillMpLbl, this.skillCdArc])
    this.skillBtn.setDepth(20).setSize(96, 96).setInteractive({
      hitArea: new Phaser.Geom.Rectangle(bx - 48, by - 48, 96, 96),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })
    this.skillBtn.on('pointerdown', () => this.tryCastSkill(true))

    this.autoTxt = this.add.text(bx, by+58, 'AUTO: ON', this.font(8,'#5ec05e'))
      .setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.autoSkill = !this.autoSkill
        this.autoTxt.setText('AUTO: '+(this.autoSkill?'ON':'OFF'))
          .setColor(this.autoSkill ? '#5ec05e' : '#c03a3a')
      })
```
with:
```typescript
    const bx = W-60, by = H-25
    this.skillCdArc = this.add.graphics()
    this.skillMpLbl = this.add.text(bx, by-28, this.skill.mpCost+' MP', this.font(6,'#7fd4ff')).setOrigin(0.5)
    const ring = this.add.circle(bx, by, 22, 0x241c2e).setStrokeStyle(3, 0xffd34d)
    const icon = this.add.text(bx, by-3, this.skill.type === 'aoe' ? '*' : '>', this.font(13,'#7fd4ff')).setOrigin(0.5)
    this.skillBtn = this.add.container(0, 0, [ring, icon, this.skillMpLbl, this.skillCdArc])
    this.skillBtn.setDepth(20).setSize(56, 56).setInteractive({
      hitArea: new Phaser.Geom.Rectangle(bx - 28, by - 28, 56, 56),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })
    this.skillBtn.on('pointerdown', () => this.tryCastSkill(true))

    this.autoTxt = this.add.text(W-130, H-18, 'AUTO: ON', this.font(6,'#5ec05e'))
      .setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.autoSkill = !this.autoSkill
        this.autoTxt.setText('AUTO: '+(this.autoSkill?'ON':'OFF'))
          .setColor(this.autoSkill ? '#5ec05e' : '#c03a3a')
      })
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/BaseCombat.ts
git commit -m "feat: shrink and move skill button to bottom strip"
```

---

### Task 4: Update buildArena() visuals

**Files:**
- Modify: `client/src/scenes/BaseCombat.ts:111-133` (buildArena)

- [ ] **Step 1: Replace buildArena() body**

In `BaseCombat.ts` lines 111–133, replace the entire `buildArena` method body:
```typescript
  buildArena(tint: number): void {
    this.add.rectangle(W/2, H/2, W, H, tint).setDepth(-10)
    const g = this.add.graphics().setDepth(-6)
    g.fillStyle(0x141019, 1)
    g.fillRect(0, ARENA.y1 - 25, W, H - ARENA.y1 + 25)
    g.fillStyle(0x1b1524, 1)
    for (let ty = ARENA.y1 - 10; ty < H; ty += 44)
      for (let tx = (ty % 88 === 0 ? 0 : 44); tx < W; tx += 88)
        g.fillRect(tx, ty, 42, 42)
    g.fillStyle(0x241c2e, 1); g.fillRect(0, ARENA.y1 - 28, W, 8)
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(
        Phaser.Math.Between(ARENA.x1, ARENA.x2),
        Phaser.Math.Between(ARENA.y1, ARENA.y2),
        Phaser.Math.Between(8, 16), 8, 0x2a2235).setDepth(-4)
    }
    // Torches
    ;[120, 840].forEach(x => {
      this.add.rectangle(x, 158, 8, 60, 0x4a3b2a).setDepth(-3)
      const flame = this.add.rectangle(x, 120, 14, 16, 0xffa726).setDepth(-3)
      this.tweens.add({ targets:flame, scaleY:1.4, alpha:0.7, duration:260, yoyo:true, repeat:-1 })
    })
  }
```
with:
```typescript
  buildArena(tint: number): void {
    this.add.rectangle(W/2, H/2, W, H, tint).setDepth(-10)
    const g = this.add.graphics().setDepth(-6)
    g.fillStyle(0x141019, 1)
    g.fillRect(0, ARENA.y1 - 25, W, H - ARENA.y1 + 25)
    g.fillStyle(0x1b1524, 1)
    for (let ty = ARENA.y1 - 10; ty < H; ty += 52)
      for (let tx = (ty % 104 === 0 ? 0 : 52); tx < W; tx += 104)
        g.fillRect(tx, ty, 50, 50)
    g.fillStyle(0x241c2e, 1); g.fillRect(0, ARENA.y1 - 28, W, 8)
    // Depth gradient at top of floor
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x000000, 0.06 * (4 - i))
      g.fillRect(0, ARENA.y1 + i * 9, W, 9)
    }
    for (let i = 0; i < 14; i++) {
      this.add.rectangle(
        Phaser.Math.Between(ARENA.x1, ARENA.x2),
        Phaser.Math.Between(ARENA.y1, ARENA.y2),
        Phaser.Math.Between(8, 16), 8, 0x2a2235).setDepth(-4)
    }
    // Torches
    ;[120, 840].forEach(x => {
      this.add.rectangle(x, 100, 8, 50, 0x4a3b2a).setDepth(-3)
      const flame = this.add.rectangle(x, 72, 14, 16, 0xffa726).setDepth(-3)
      this.tweens.add({ targets:flame, scaleY:1.4, alpha:0.7, duration:260, yoyo:true, repeat:-1 })
    })
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Visual verification — run dev server**

```bash
cd client && npm run dev
```
Open the game, go to Expedition. Verify:
- Arena floor starts visibly higher (more vertical room)
- Torches appear on the wall above the floor line
- Tiles look slightly larger, less cramped
- Subtle dark gradient at top edge of floor
- More debris scattered across the floor
- Hero spawns in bottom-left (not far corner)
- HP/MP/XP bars are a thin strip at very bottom of screen
- Skill button is a small circle in bottom-right corner
- AUTO toggle appears next to skill button
- Full arena clear of persistent UI elements

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/BaseCombat.ts
git commit -m "feat: update arena visuals - larger tiles, gradient, debris, torches"
```
