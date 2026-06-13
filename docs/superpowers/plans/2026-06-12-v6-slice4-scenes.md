# Scene Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace current passive Hub with fully active combat scenes matching the v6 prototype — click-to-move hero, real-time enemies, skill casting, loot on kill. Includes LobbyScene, ExpeditionScene, DungeonScene, and main.ts wiring.

**Architecture:** `BaseCombat` abstract Phaser scene holds all shared combat logic (arena, HUD, hero movement, enemy AI, skill system). `ExpeditionScene` and `DungeonScene` extend it. `LobbyScene` is a separate non-combat scene with click-to-move hero for presence. All scenes use `PaperDollContainer` for hero rendering.

**Dependencies:** Requires Slices 1-3 (item types, PaperDollContainer, skill types, GameState).

**Tech Stack:** TypeScript, Phaser 3.80

---

## File Map

| Action | Path |
|---|---|
| Create | `client/src/scenes/BaseCombat.ts` |
| Create | `client/src/scenes/LobbyScene.ts` |
| Create | `client/src/scenes/ExpeditionScene.ts` |
| Create | `client/src/scenes/DungeonScene.ts` |
| Modify | `client/src/main.ts` |
| Modify | `client/src/scenes/CharacterSheetScene.ts` (back button target) |

`HubScene.ts` is replaced by `LobbyScene.ts`. The old file can be deleted after wiring.

---

## Task 19: BaseCombat — Shared combat scene

**Files:**
- Create: `client/src/scenes/BaseCombat.ts`

- [ ] **Step 1: Create BaseCombat.ts**

```typescript
// client/src/scenes/BaseCombat.ts
import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import type { Character } from '../types/api'

export const W = 960, H = 540
export const PX = 5
export const FONT = '"Press Start 2P", monospace'
export const ARENA = { x1: 50, y1: 215, x2: 910, y2: 500 }
export const SKILL_RADIUS = 150
const MP_REGEN = 7

export interface SkillDef {
  name: string
  mult: number
  cd: number       // seconds
  mpCost: number
  type: 'aoe' | 'dash'
}

export const SKILLS: Record<string, SkillDef> = {
  whirlwind: { name:'WHIRLWIND', mult:2.2, cd:6.0, mpCost:35, type:'aoe' },
  charge:    { name:'CHARGE',    mult:3.4, cd:5.0, mpCost:25, type:'dash' },
}

export interface EnemyDef {
  key: string
  name: string
  hp: number
  atk: number
  atkSpeed: number
  gold: number
  speed: number
  aggro: number
  range: number
}

export const ENEMY_TYPES: EnemyDef[] = [
  { key:'slime',    name:'Slime',    hp:30, atk:4, atkSpeed:2.6, gold:3, speed:55,  aggro:150, range:52 },
  { key:'bat',      name:'Bat',      hp:22, atk:6, atkSpeed:1.8, gold:4, speed:115, aggro:220, range:50 },
  { key:'skeleton', name:'Skeleton', hp:45, atk:9, atkSpeed:3.2, gold:7, speed:75,  aggro:180, range:56 },
]

interface HeroState {
  maxHp: number; hp: number
  maxMp: number; mp: number
  atk: number; def: number; crit: number; critMult: number; cdr: number
  speed: number
  nextAtk: number; skillReady: number; castLock: number
  x: number; y: number
  doll: PaperDollContainer
  shadow: Phaser.GameObjects.Ellipse
  hpBar: Phaser.GameObjects.Graphics
}

interface EnemyState {
  name: string
  maxHp: number; hp: number
  atk: number; atkSpeed: number; speed: number
  aggro: number; range: number; gold: number
  x: number; y: number; spawnX: number; spawnY: number
  nextAtk: number
  sprite: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Ellipse
  hpBar: Phaser.GameObjects.Graphics
  dead: boolean; angry: boolean
  boss: boolean; elite: boolean
  barW: number; barOff: number
  wTarget?: { x: number; y: number }; wUntil?: number
}

export abstract class BaseCombat extends Phaser.Scene {
  protected hero!: HeroState
  protected enemies: EnemyState[] = []
  protected skill!: SkillDef
  protected moveTo: { x: number; y: number } | null = null
  protected busy = false
  protected menuOpen = false
  protected portal: { x: number; y: number; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } | null = null
  protected autoSkill = true

  // HUD refs
  private txtGold!: Phaser.GameObjects.Text
  private txtLevel!: Phaser.GameObjects.Text
  private heroHudHp!: Phaser.GameObjects.Graphics
  private heroHudMp!: Phaser.GameObjects.Graphics
  private heroHudXp!: Phaser.GameObjects.Graphics
  private skillBtn!: Phaser.GameObjects.Container
  private skillCdArc!: Phaser.GameObjects.Graphics
  private skillMpLbl!: Phaser.GameObjects.Text
  private autoTxt!: Phaser.GameObjects.Text
  private txtBanner!: Phaser.GameObjects.Text

  // Accumulated session rewards (client-authoritative)
  protected sessionXP   = 0
  protected sessionGold = 0
  protected sessionItems: string[] = []  // item template IDs

  font(size: number, color = '#e8e2d0'): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT, fontSize: `${size}px`, color,
             stroke: '#000', strokeThickness: 4 }
  }

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

  buildHero(): void {
    const char = GameState.instance.character!
    const skills = GameState.instance.skills
    this.skill = SKILLS[skills.equipped_skill] ?? SKILLS['whirlwind']

    const doll = new PaperDollContainer(this, 130, 360)
    doll.setDepth(3)
    // Apply equipped items to doll
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as any, item.template.name)
    }

    this.hero = {
      maxHp: char.max_hp,  hp: char.hp,
      maxMp: 100,          mp: 100,
      atk:   char.attack,  def:  char.defense,
      crit:  char.critical / 100,
      critMult: 2.0,       cdr:  char.cdr / 100,
      speed: 175,
      nextAtk: 0, skillReady: 0, castLock: 0,
      x: 130, y: 360,
      doll,
      shadow: this.add.ellipse(130, 392, 50, 12, 0x000000, 0.35).setDepth(1),
      hpBar:  this.add.graphics().setDepth(8),
    }
  }

  setupInput(): void {
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.busy || this.menuOpen) return
      const p = _p as Phaser.Input.Pointer
      if (p.worldY < ARENA.y1 - 30) return
      this.moveTo = {
        x: Phaser.Math.Clamp(p.worldX, ARENA.x1, ARENA.x2),
        y: Phaser.Math.Clamp(p.worldY, ARENA.y1, ARENA.y2),
      }
      this.showClickMarker(this.moveTo.x, this.moveTo.y)
    })
  }

  private showClickMarker(x: number, y: number): void {
    const r = this.add.circle(x, y, 4).setStrokeStyle(3, 0x5ec05e, 1).setDepth(1)
    this.tweens.add({ targets:r, alpha:0, duration:350, ease:'Quad.out',
      onUpdate: () => r.setStrokeStyle(3, 0x5ec05e, Math.max(r.alpha, 0)),
      onComplete: () => r.destroy() })
  }

  buildCoreHUD(): void {
    this.txtGold  = this.add.text(W-16, 14, '', this.font(11,'#ffd34d')).setOrigin(1,0).setDepth(20)
    this.txtLevel = this.add.text(W-16, 38, '', this.font(9,'#9aa8bd')).setOrigin(1,0).setDepth(20)
    this.heroHudHp = this.add.graphics().setDepth(20)
    this.heroHudMp = this.add.graphics().setDepth(20)
    this.heroHudXp = this.add.graphics().setDepth(20)

    const bx = W-90, by = H-90
    this.skillCdArc = this.add.graphics()
    this.skillMpLbl = this.add.text(bx, by-34, this.skill.mpCost+' MP', this.font(7,'#7fd4ff')).setOrigin(0.5)
    const ring = this.add.circle(bx, by, 44, 0x241c2e).setStrokeStyle(4, 0xffd34d)
    const icon = this.add.text(bx, by-6, this.skill.type === 'aoe' ? '⚛' : '➤', this.font(26,'#7fd4ff')).setOrigin(0.5)
    const lbl  = this.add.text(bx, by+28, this.skill.name, this.font(7)).setOrigin(0.5)
    this.skillBtn = this.add.container(0, 0, [ring, icon, lbl, this.skillMpLbl, this.skillCdArc])
    this.skillBtn.setDepth(20).setSize(96, 96).setInteractive({ useHandCursor: true })
    this.skillBtn.on('pointerdown', () => this.tryCastSkill(true))

    this.autoTxt = this.add.text(bx, by+58, 'AUTO: ON', this.font(8,'#5ec05e'))
      .setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.autoSkill = !this.autoSkill
        this.autoTxt.setText('AUTO: '+(this.autoSkill?'ON':'OFF'))
          .setColor(this.autoSkill ? '#5ec05e' : '#c03a3a')
      })

    this.txtBanner = this.add.text(W/2, 130, '', this.font(18,'#ffd34d'))
      .setOrigin(0.5).setDepth(30).setAlpha(0)

    // Menu button
    this.add.text(W/2, 18, '☰ MENU', this.font(11))
      .setOrigin(0.5,0).setDepth(20).setPadding(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openMenu())

    this.refreshCoreHUD()
  }

  refreshCoreHUD(): void {
    const char = GameState.instance.character!
    this.txtGold.setText('GOLD '+char.gold)
    this.txtLevel.setText('LV.'+char.level+'  XP '+char.xp+'/'+char.xp_to_next)
  }

  banner(text: string, color: string): void {
    this.txtBanner.setText(text).setColor(color).setAlpha(1)
    this.tweens.add({ targets:this.txtBanner, alpha:0, duration:1800, delay:600, ease:'Quad.in' })
  }

  // ── Bar drawing ─────────────────────────────────────────────────────────────
  drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, pct: number, color: number): void {
    g.clear()
    g.fillStyle(0x1a1a2e, 1); g.fillRect(x, y, w, h)
    g.fillStyle(color, 1);    g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, pct))), h)
  }

  // ── Movement & physics ──────────────────────────────────────────────────────
  private moveToward(unit: { x:number;y:number }, tx: number, ty: number, speed: number, dt: number): boolean {
    const d = Phaser.Math.Distance.Between(unit.x, unit.y, tx, ty)
    if (d < 2) return false
    const step = Math.min(speed * dt, d)
    unit.x += (tx - unit.x) / d * step
    unit.y += (ty - unit.y) / d * step
    return true
  }

  syncHero(): void {
    const h = this.hero
    h.x = Phaser.Math.Clamp(h.x, ARENA.x1, ARENA.x2)
    h.y = Phaser.Math.Clamp(h.y, ARENA.y1, ARENA.y2)
    h.doll.setPosition(h.x, h.y)
    h.shadow.setPosition(h.x, h.y + 32)
  }

  syncEnemy(e: EnemyState): void {
    e.x = Phaser.Math.Clamp(e.x, ARENA.x1, ARENA.x2)
    e.y = Phaser.Math.Clamp(e.y, ARENA.y1, ARENA.y2)
    e.sprite.setPosition(e.x, e.y).setDepth(e.y / 100 + 2)
    e.shadow.setPosition(e.x, e.y + 32)
  }

  aliveEnemies(): EnemyState[] { return this.enemies.filter(e => !e.dead) }

  nearestEnemy(pos: {x:number;y:number}): { enemy: EnemyState|null; d: number } {
    let best: EnemyState|null = null, bd = Infinity
    this.aliveEnemies().forEach(e => {
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, e.x, e.y)
      if (d < bd) { bd = d; best = e }
    })
    return { enemy: best, d: bd }
  }

  enemiesWithin(pos: {x:number;y:number}, r: number): EnemyState[] {
    return this.aliveEnemies().filter(e => Phaser.Math.Distance.Between(pos.x, pos.y, e.x, e.y) <= r)
  }

  // ── Base update loop ────────────────────────────────────────────────────────
  baseUpdate(time: number, delta: number): void {
    const h  = this.hero
    const dt = delta / 1000

    h.mp = Math.min(h.maxMp, h.mp + MP_REGEN * dt)
    if (!this.enemiesWithin(h, 240).length && h.hp < h.maxHp && !this.busy) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.03 * dt)
    }

    this.drawBar(this.heroHudHp, 20, H-72, 240, 14, h.hp/h.maxHp, 0x5ec05e)
    this.drawBar(this.heroHudMp, 20, H-52, 240, 10, h.mp/h.maxMp, 0x4da3ff)
    const char = GameState.instance.character!
    this.drawBar(this.heroHudXp, 20, H-36, 240, 6, char.xp/char.xp_to_next, 0xffd34d)
    this.drawBar(h.hpBar, h.x-28, h.y-52, 56, 6, h.hp/h.maxHp, 0x5ec05e)
    this.aliveEnemies().forEach(e =>
      this.drawBar(e.hpBar, e.x - e.barW/2, e.y - e.barOff, e.barW, 6, e.hp/e.maxHp, 0xc03a3a))

    // Skill cooldown arc
    const cdLeft = Math.max(0, h.skillReady - time)
    this.skillCdArc.clear()
    if (cdLeft > 0) {
      const frac = cdLeft / (this.skill.cd * 1000 * (1 - h.cdr))
      this.skillCdArc.fillStyle(0x000000, 0.6)
      this.skillCdArc.slice(W-90, H-90, 44, -Math.PI/2, -Math.PI/2 + frac*Math.PI*2, false)
      this.skillCdArc.fillPath()
    }
    this.skillMpLbl.setColor(h.mp >= this.skill.mpCost ? '#7fd4ff' : '#c03a3a')

    if (this.busy || this.menuOpen) return
    this.updateHero(time, dt)
    this.updateEnemies(time, dt)
    this.separateEnemies()
    this.checkPortal()
  }

  private updateHero(time: number, dt: number): void {
    const h = this.hero
    if (time < h.castLock) { this.syncHero(); return }

    if (this.moveTo) {
      const moved = this.moveToward(h, this.moveTo.x, this.moveTo.y, h.speed, dt)
      if (!moved || Phaser.Math.Distance.Between(h.x, h.y, this.moveTo.x, this.moveTo.y) < 4)
        this.moveTo = null
    } else if (this.autoSkill) {
      const { enemy, d } = this.nearestEnemy(h)
      if (enemy) {
        if (d > 64) this.moveToward(h, enemy.x, enemy.y, h.speed, dt)
        else h.doll.setFlipX(enemy.x < h.x)
      } else if (this.portal) {
        this.moveToward(h, this.portal.x, this.portal.y, h.speed, dt)
      }
    }
    this.syncHero()

    const { enemy, d } = this.nearestEnemy(h)
    if (enemy && d <= 72 && time >= h.nextAtk) {
      h.nextAtk = time + 1200
      const isCrit = Math.random() < h.crit
      const dmg    = Math.round(h.atk * (0.85 + Math.random()*0.3) * (isCrit ? h.critMult : 1))
      h.doll.setFlipX(enemy.x < h.x)
      this.jabAnim(h, enemy)
      this.slashFx(enemy.x, enemy.y, isCrit)
      this.applyDamage(enemy, dmg, isCrit)
    }

    if (this.autoSkill && time >= h.skillReady && h.mp >= this.skill.mpCost) {
      if (this.skill.type === 'aoe' && this.enemiesWithin(h, SKILL_RADIUS).length >= 2)
        this.tryCastSkill(false)
      else if (this.skill.type === 'dash') {
        const { enemy: e2, d: d2 } = this.nearestEnemy(h)
        if (e2 && d2 > 110) this.tryCastSkill(false)
      }
    }
  }

  private updateEnemies(time: number, dt: number): void {
    const h = this.hero
    this.aliveEnemies().forEach(e => {
      const d = Phaser.Math.Distance.Between(e.x, e.y, h.x, h.y)
      if (d <= e.aggro || e.angry) {
        e.angry = true
        if (d > e.range) {
          this.moveToward(e, h.x, h.y, e.speed, dt)
        } else {
          e.sprite.setFlipX(h.x < e.x)
          if (time >= e.nextAtk) {
            e.nextAtk = time + e.atkSpeed * 1000
            this.enemyStrike(e)
          }
        }
      } else {
        if (!e.wTarget || Phaser.Math.Distance.Between(e.x, e.y, e.wTarget.x, e.wTarget.y) < 6
            || time > (e.wUntil ?? 0)) {
          e.wTarget = {
            x: Phaser.Math.Clamp(e.spawnX + Phaser.Math.Between(-50,50), ARENA.x1, ARENA.x2),
            y: Phaser.Math.Clamp(e.spawnY + Phaser.Math.Between(-35,35), ARENA.y1, ARENA.y2),
          }
          e.wUntil = time + Phaser.Math.Between(1500, 3200)
        }
        this.moveToward(e, e.wTarget.x, e.wTarget.y, e.speed * 0.4, dt)
      }
      this.syncEnemy(e)
    })
  }

  private separateEnemies(): void {
    const list = this.aliveEnemies()
    for (let i = 0; i < list.length; i++) for (let j = i+1; j < list.length; j++) {
      const a = list[i], b = list[j]
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
      const min = 34
      if (d > 0 && d < min) {
        const push = (min - d) / 2
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d
        a.x -= nx * push; a.y -= ny * push
        b.x += nx * push; b.y += ny * push
      }
    }
  }

  // ── Combat ──────────────────────────────────────────────────────────────────
  private enemyStrike(e: EnemyState): void {
    const h = this.hero
    const dmg = Math.max(1, Math.round(e.atk * (0.85 + Math.random()*0.3) - h.def))
    this.jabAnim(e, h)
    h.hp = Math.max(0, h.hp - dmg)
    this.hitFlash(h.doll as any)
    this.floatDamage(h.x, h.y - 56, dmg, '#ff7a6e', false)
    this.cameras.main.shake(60, 0.002)
    if (h.hp <= 0) this.onHeroDown()
  }

  applyDamage(e: EnemyState, dmg: number, isCrit: boolean, color?: string): void {
    if (e.dead) return
    e.hp -= dmg; e.angry = true
    this.hitFlash(e.sprite)
    this.floatDamage(e.x, e.y - e.barOff - 4, dmg, color ?? (isCrit ? '#ffffff' : '#ffdd88'), isCrit)
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e: EnemyState): void {
    e.dead = true; e.hp = 0; e.hpBar.clear()
    e.shadow.destroy()
    this.tweens.add({ targets:e.sprite, alpha:0, y:`+=14`, angle:90,
      duration:350, onComplete: () => e.sprite.destroy() })
    this.onEnemyKilled(e)
    if (!this.aliveEnemies().length) this.onRoomCleared()
  }

  tryCastSkill(manual: boolean): void {
    const now = this.time.now, h = this.hero
    const cdMs = this.skill.cd * 1000 * (1 - h.cdr)
    if (this.busy || now < h.skillReady || h.mp < this.skill.mpCost) {
      if (manual) this.tweens.add({ targets:this.skillBtn, x:'+=4', duration:40, yoyo:true, repeat:2 })
      return
    }
    h.mp -= this.skill.mpCost
    h.skillReady = now + cdMs
    if (this.skill.type === 'aoe') {
      h.castLock = now + 650
      this.castWhirlwind()
    } else {
      h.castLock = now + 520
      this.castCharge()
    }
  }

  private castWhirlwind(): void {
    const h = this.hero
    this.banner('WHIRLWIND!', '#7fd4ff')
    this.tweens.add({ targets:h.doll, angle:720, duration:520, ease:'Cubic.out',
      onComplete: () => (h.doll as any).setAngle?.(0) })
    const ring = this.add.circle(h.x, h.y, 12).setDepth(9).setStrokeStyle(6, 0x7fd4ff, 1)
    this.tweens.add({ targets:ring, radius:SKILL_RADIUS, alpha:0, duration:480, ease:'Quad.out',
      onUpdate: () => ring.setStrokeStyle(6, 0x7fd4ff, Math.max(ring.alpha, 0)),
      onComplete: () => ring.destroy() })
    this.cameras.main.shake(180, 0.006)
    this.time.delayedCall(160, () => {
      const dmg = Math.round(h.atk * this.skill.mult)
      this.enemiesWithin(h, SKILL_RADIUS).forEach(e => this.applyDamage(e, dmg, false, '#7fd4ff'))
    })
  }

  private castCharge(): void {
    const h = this.hero
    const { enemy } = this.nearestEnemy(h)
    if (!enemy) return
    const tx = Phaser.Math.Clamp(enemy.x - 30 * Math.sign(enemy.x - h.x), ARENA.x1, ARENA.x2)
    const ty = Phaser.Math.Clamp(enemy.y, ARENA.y1, ARENA.y2)
    this.banner('CHARGE!', '#ffd34d')
    this.tweens.add({ targets:h, x:tx, y:ty, duration:220, ease:'Cubic.in',
      onUpdate: () => this.syncHero(),
      onComplete: () => {
        this.cameras.main.shake(150, 0.006)
        const dmg = Math.round(h.atk * this.skill.mult)
        this.applyDamage(enemy, dmg, true, '#ffd34d')
        this.enemiesWithin(enemy, 70).forEach(e => {
          if (e !== enemy) this.applyDamage(e, Math.round(dmg * 0.4), false, '#ffd34d')
        })
      },
    })
  }

  // ── VFX ─────────────────────────────────────────────────────────────────────
  private jabAnim(from: {x:number;y:number}, to: {x:number;y:number}): void {
    const line = this.add.graphics().setDepth(9)
    line.lineStyle(2, 0xffffff, 0.7)
    line.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y))
    this.tweens.add({ targets:line, alpha:0, duration:120, onComplete: () => line.destroy() })
  }

  slashFx(x: number, y: number, crit: boolean): void {
    const color = crit ? 0xffffff : 0xffdd88
    for (let i = 0; i < (crit ? 5 : 3); i++) {
      const p = this.add.rectangle(
        x + Phaser.Math.Between(-16,16), y + Phaser.Math.Between(-16,16),
        crit ? 6 : 4, crit ? 6 : 4, color).setDepth(9)
      this.tweens.add({ targets:p, x:`+=${Phaser.Math.Between(-24,24)}`,
        y:`+=${Phaser.Math.Between(-24,24)}`, alpha:0, duration:300,
        onComplete: () => p.destroy() })
    }
  }

  private hitFlash(sprite: Phaser.GameObjects.Image): void {
    this.tweens.add({ targets:sprite, alpha:0.2, duration:60, yoyo:true })
  }

  floatDamage(x: number, y: number, dmg: number, color: string, crit: boolean): void {
    const size = crit ? 16 : 12
    const txt = this.add.text(x, y, String(dmg), this.font(size, color)).setOrigin(0.5).setDepth(15)
    this.tweens.add({ targets:txt, y:y-48, alpha:0, duration:crit?900:700,
      ease:'Quad.out', onComplete: () => txt.destroy() })
  }

  // ── Portal ───────────────────────────────────────────────────────────────────
  spawnPortal(): void {
    const px = Phaser.Math.Clamp(this.hero.x + 150, ARENA.x1 + 60, ARENA.x2 - 60)
    const py = Phaser.Math.Clamp(this.hero.y, ARENA.y1 + 40, ARENA.y2 - 40)
    const outer = this.add.circle(0,0,36).setStrokeStyle(5, 0x7fd4ff, 0.9)
    const inner = this.add.circle(0,0,20, 0x7fd4ff, 0.25)
    this.tweens.add({ targets:inner, scale:1.5, alpha:0.08, duration:700, yoyo:true, repeat:-1 })
    const c = this.add.container(px, py, [outer, inner]).setDepth(py/100+2)
    this.tweens.add({ targets:c, y:py-6, duration:800, yoyo:true, repeat:-1, ease:'Sine.inOut' })
    const lbl = this.add.text(px, py-56, 'PORTAL', this.font(8,'#7fd4ff')).setOrigin(0.5).setDepth(20)
    this.portal = { x:px, y:py, container:c, label:lbl }
    this.banner('PORTAL OPEN!', '#7fd4ff')
  }

  removePortal(): void {
    if (!this.portal) return
    this.portal.container.destroy()
    this.portal.label.destroy()
    this.portal = null
  }

  checkPortal(): void {
    if (!this.portal) return
    const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, this.portal.x, this.portal.y)
    if (d < 48) this.nextRoom()
  }

  // ── Enemy spawning ───────────────────────────────────────────────────────────
  spawnEnemyObj(def: EnemyDef, scale: number, pos: {x:number;y:number}): EnemyState {
    const hp = Math.round(def.hp * scale)
    const e: EnemyState = {
      name: def.name,
      maxHp: hp, hp,
      atk:      Math.round(def.atk * scale),
      atkSpeed: def.atkSpeed,
      speed:    def.speed,
      aggro:    def.aggro,
      range:    def.range,
      gold:     Math.round(def.gold * scale),
      x: pos.x, y: pos.y, spawnX: pos.x, spawnY: pos.y,
      nextAtk: this.time.now + def.atkSpeed * 1000 * (0.6 + Math.random()*0.8),
      sprite: this.add.image(pos.x, pos.y, `spr_${def.key}`)
        .setFlipX(true).setScale(0).setDepth(pos.y/100+2),
      shadow: this.add.ellipse(pos.x, pos.y+32, 46, 11, 0x000000, 0.3).setDepth(1),
      hpBar: this.add.graphics().setDepth(8),
      dead:false, angry:false, boss:false, elite:false,
      barW:56, barOff:48,
    }
    this.tweens.add({ targets:e.sprite, scale:1, duration:320, ease:'Back.out' })
    return e
  }

  spawnPacks(total: number, scale: number, pool: EnemyDef[]): EnemyState[] {
    const enemies: EnemyState[] = []
    let remaining = total
    const centers: {x:number;y:number}[] = []
    while (remaining > 0) {
      const packSize = Math.min(remaining, Phaser.Math.Between(2,3))
      remaining -= packSize
      let cx=0, cy=0, tries=0
      do {
        cx = Phaser.Math.Between(ARENA.x1+200, ARENA.x2-40)
        cy = Phaser.Math.Between(ARENA.y1+30, ARENA.y2-30)
        tries++
      } while (tries < 20 && (
        Phaser.Math.Distance.Between(cx, cy, this.hero.x, this.hero.y) < 240 ||
        centers.some(c => Phaser.Math.Distance.Between(c.x, c.y, cx, cy) < 170)
      ))
      centers.push({x:cx,y:cy})
      for (let i = 0; i < packSize; i++) {
        const def = Phaser.Utils.Array.GetRandom(pool)
        const ang = (i / packSize) * Math.PI * 2 + Math.random()
        enemies.push(this.spawnEnemyObj(def, scale, {
          x: Phaser.Math.Clamp(cx + Math.cos(ang)*38, ARENA.x1, ARENA.x2),
          y: Phaser.Math.Clamp(cy + Math.sin(ang)*28, ARENA.y1, ARENA.y2),
        }))
      }
    }
    return enemies
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────
  openMenu(): void {
    if (this.menuOpen) return
    this.menuOpen = true
    const c = this.add.container(0, 0).setDepth(50)
    c.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.7))
    const options = this.menuOptions()
    options.forEach((opt, i) => {
      const y = H/2 - ((options.length-1) * 36)/2 + i * 36
      const btn = this.add.rectangle(W/2, y, 380, 32, 0x1a1a2e)
        .setStrokeStyle(1, 0x334455).setInteractive({ useHandCursor: true })
      const lbl = this.add.text(W/2, y, opt.label, this.font(10, opt.color ?? '#e8e2d0')).setOrigin(0.5)
      c.add([btn, lbl])
      btn.on('pointerdown', () => { c.destroy(); this.menuOpen = false; opt.onPick() })
    })
  }

  // ── Abstract/overridable hooks ────────────────────────────────────────────────
  protected abstract menuOptions(): Array<{ label: string; color?: string; onPick: () => void }>
  protected abstract onEnemyKilled(e: EnemyState): void
  protected abstract onRoomCleared(): void
  protected abstract nextRoom(): void
  protected abstract onHeroDown(): void
}
```

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors (warnings OK).

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/BaseCombat.ts
git commit -m "feat(client): add BaseCombat abstract scene with full combat engine"
```

---

## Task 20: LobbyScene

**Files:**
- Create: `client/src/scenes/LobbyScene.ts`

- [ ] **Step 1: Create LobbyScene.ts**

```typescript
// client/src/scenes/LobbyScene.ts
import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { W, H, FONT } from './BaseCombat'

const LOBBY_ARENA = { x1: 60, y1: 335, x2: 900, y2: 520 }

interface POI {
  x: number; y: number; r: number
  label: string
  color: number
  onEnter: () => void
}

export class LobbyScene extends Phaser.Scene {
  private hero!: { x: number; y: number; speed: number; doll: PaperDollContainer; shadow: Phaser.GameObjects.Ellipse }
  private moveTo: { x: number; y: number } | null = null
  private pois: POI[] = []
  private locked = false

  constructor() { super({ key: 'Lobby' }) }

  font(size: number, color = '#e8e2d0'): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 4 }
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.buildCamp()
    this.buildHeroAvatar()
    this.buildPOIs()
    this.buildTopUI()
    this.setupInput()
  }

  private buildCamp(): void {
    this.add.rectangle(W/2, H/2, W, H, 0x151a26).setDepth(-10)
    const g = this.add.graphics().setDepth(-6)
    // Stars
    g.fillStyle(0xe8e2d0, 0.8)
    for (let i = 0; i < 40; i++)
      g.fillRect(Phaser.Math.Between(0,W), Phaser.Math.Between(0,190), 2, 2)
    // Mountains
    g.fillStyle(0x1c2435, 1)
    g.fillTriangle(60,335,260,150,460,335)
    g.fillTriangle(380,335,600,110,860,335)
    g.fillStyle(0x232c40, 1)
    g.fillTriangle(-40,335,140,200,340,335)
    g.fillTriangle(620,335,800,190,1020,335)
    // Ground
    g.fillStyle(0x1b1622, 1); g.fillRect(0,335,W,H-335)
    g.fillStyle(0x232c40, 0.4)
    for (let ty=344; ty<H; ty+=44)
      for (let tx=(ty%88===0?0:44); tx<W; tx+=88)
        g.fillRect(tx,ty,42,42)
    g.fillStyle(0x2a2235,1); g.fillRect(0,335,W,8)
    // Campfire
    g.fillStyle(0x4a3b2a,1)
    g.fillRect(W/2-17,420,34,8); g.fillRect(W/2-9,414,8,18)
    const flame = this.add.rectangle(W/2,405,18,24,0xffa726).setDepth(3)
    this.tweens.add({ targets:flame, scaleY:1.5, scaleX:0.8, alpha:0.75, duration:220, yoyo:true, repeat:-1 })

    this.add.text(W/2, 26, 'CAMP', this.font(16,'#ffd34d')).setOrigin(0.5).setDepth(20)
    const hint = this.add.text(W/2, H-12, 'CLICK TO WALK  •  APPROACH ENTRANCE TO ENTER',
      this.font(7,'#9aa8bd')).setOrigin(0.5,1).setDepth(20)
    this.tweens.add({ targets:hint, alpha:0.35, duration:1100, yoyo:true, repeat:-1 })
  }

  private buildHeroAvatar(): void {
    const doll = new PaperDollContainer(this, W/2, 472)
    doll.setDepth(3)
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as any, item.template.name)
    }
    this.hero = {
      x: W/2, y: 472, speed: 175, doll,
      shadow: this.add.ellipse(W/2, 504, 50, 12, 0x000000, 0.35).setDepth(1),
    }
  }

  private addPOI(poi: POI): void {
    this.pois.push(poi)
    // Proximity ring (visual only)
    const ring = this.add.circle(poi.x, poi.y, poi.r).setStrokeStyle(2, poi.color, 0.3).setDepth(0)
    this.tweens.add({ targets:ring, scale:1.08, alpha:0.15, duration:900, yoyo:true, repeat:-1 })
    this.add.text(poi.x, poi.y + poi.r + 14, poi.label, this.font(8, `#${poi.color.toString(16).padStart(6,'0')}`))
      .setOrigin(0.5).setDepth(20)
  }

  private buildPOIs(): void {
    // Expedition gate (right side)
    this.addPOI({ x:854, y:390, r:55, color:0x5ec05e, label:'EXPEDITION',
      onEnter: () => this.scene.start('Expedition') })

    // Dungeon gate (left side)
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x2a2235, 1); g.fillRect(78,244,110,98)
    g.fillStyle(0x0b0a12, 1); g.fillRect(103,270,60,72)
    g.fillStyle(0x3a2a4a, 1); g.fillTriangle(78,244,133,208,188,244)
    this.addPOI({ x:133, y:390, r:55, color:0xc45aff, label:'DUNGEON',
      onEnter: () => this.scene.start('Dungeon') })

    // Shop (center)
    this.addPOI({ x:640, y:416, r:50, color:0xffd34d, label:'SHOP',
      onEnter: () => this.openShop() })

    // Character sheet board (left-center)
    this.addPOI({ x:382, y:390, r:50, color:0x9aa8bd, label:'CHARACTER',
      onEnter: () => this.scene.start('CharacterSheet') })
  }

  private buildTopUI(): void {
    const char = GameState.instance.character!
    this.add.text(20, 14, `${char.name}  Lv.${char.level}  ${char.class}`, this.font(11)).setDepth(20)
    this.add.text(20, 34, `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`, this.font(9,'#aaaacc')).setDepth(20)
  }

  private setupInput(): void {
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.locked) return
      const p = _p as Phaser.Input.Pointer
      if (p.worldY < LOBBY_ARENA.y1 - 25) return
      this.moveTo = {
        x: Phaser.Math.Clamp(p.worldX, LOBBY_ARENA.x1, LOBBY_ARENA.x2),
        y: Phaser.Math.Clamp(p.worldY, LOBBY_ARENA.y1, LOBBY_ARENA.y2),
      }
      // Click marker
      const r = this.add.circle(this.moveTo.x, this.moveTo.y, 4).setStrokeStyle(3, 0x5ec05e).setDepth(1)
      this.tweens.add({ targets:r, alpha:0, duration:350, ease:'Quad.out',
        onUpdate: () => r.setStrokeStyle(3, 0x5ec05e, Math.max(r.alpha, 0)),
        onComplete: () => r.destroy() })
    })
  }

  update(_time: number, delta: number): void {
    if (!this.hero) return
    const dt = delta / 1000
    const h  = this.hero
    if (this.moveTo) {
      const d = Phaser.Math.Distance.Between(h.x, h.y, this.moveTo.x, this.moveTo.y)
      if (d > 4) {
        const step = Math.min(h.speed * dt, d)
        const dx = (this.moveTo.x - h.x) / d
        const dy = (this.moveTo.y - h.y) / d
        h.x += dx * step; h.y += dy * step
        h.doll.setFlipX(dx < 0)
      } else {
        this.moveTo = null
      }
    }
    h.x = Phaser.Math.Clamp(h.x, LOBBY_ARENA.x1, LOBBY_ARENA.x2)
    h.y = Phaser.Math.Clamp(h.y, LOBBY_ARENA.y1, LOBBY_ARENA.y2)
    h.doll.setPosition(h.x, h.y)
    h.shadow.setPosition(h.x, h.y + 32)

    // Check POI proximity
    if (!this.locked) {
      for (const poi of this.pois) {
        const d = Phaser.Math.Distance.Between(h.x, h.y, poi.x, poi.y)
        if (d < poi.r - 10) {
          this.locked = true
          poi.onEnter()
          break
        }
      }
    }
  }

  private openShop(): void {
    const char = GameState.instance.character!
    // Simple shop overlay
    const overlay = this.add.container(0,0).setDepth(60)
    overlay.add(this.add.rectangle(W/2,H/2,W,H, 0x000000, 0.75))
    overlay.add(this.add.text(W/2, 160, 'SHOP', this.font(18,'#ffd34d')).setOrigin(0.5))
    // HP potion
    const hp = this.add.rectangle(W/2-80, 280, 200, 50, 0x1a2a1a).setStrokeStyle(1, 0x5ec05e).setInteractive({ useHandCursor:true })
    overlay.add(hp)
    overlay.add(this.add.text(W/2-80, 272, 'HP Potion', this.font(11,'#5ec05e')).setOrigin(0.5))
    overlay.add(this.add.text(W/2-80, 290, '50 Gold — +50% HP', this.font(8,'#888899')).setOrigin(0.5))
    hp.on('pointerdown', () => {
      if (char.gold < 50) return
      char.gold -= 50
      char.hp = Math.min(char.max_hp, char.hp + Math.round(char.max_hp * 0.5))
      this.buildTopUI()
    })
    // Close
    const close = this.add.rectangle(W/2, 420, 120, 36, 0x334455).setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor:true })
    overlay.add(close)
    overlay.add(this.add.text(W/2, 420, 'CLOSE', this.font(10)).setOrigin(0.5))
    close.on('pointerdown', () => { overlay.destroy(); this.locked = false })
  }
}
```

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | grep -E "^.*error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/LobbyScene.ts
git commit -m "feat(client): add LobbyScene with click-to-move hero and POI navigation"
```

---

## Task 21: ExpeditionScene

**Files:**
- Create: `client/src/scenes/ExpeditionScene.ts`

- [ ] **Step 1: Create ExpeditionScene.ts**

```typescript
// client/src/scenes/ExpeditionScene.ts
import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES, ARENA, W } from './BaseCombat'
import { GameState } from '../state/GameState'
import { completeExpedition } from '../api/items'
import { startExpedition } from '../api/expedition'

// Drop chances per zone (zone index 0-based)
const DROP_CHANCE   = 0.10
const UNCOMMON_ODDS = 0.25  // at zone >= 1

const EXPEDITION_ITEM_POOLS: Record<string, string[]> = {
  Common:   ['Iron Sword','Leather Chestplate','Leather Boots','Copper Ring'],
  Uncommon: ["Soldier's Sword","Scout's Helm",'Quartz Amulet'],
}

export class ExpeditionScene extends BaseCombat {
  private zone = 1
  private room = 1
  private txtZone!: Phaser.GameObjects.Text
  private txtRoom!: Phaser.GameObjects.Text

  constructor() { super({ key: 'Expedition' }) }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.busy = false; this.menuOpen = false; this.portal = null
    this.sessionXP = 0; this.sessionGold = 0; this.sessionItems = []

    // Start/resume expedition run
    try {
      const run = await startExpedition(char.id, 'forest')
      GameState.instance.expeditionRun = run
    } catch { /* continue even if run tracking fails */ }

    this.buildArena(0x1a2a1e)
    this.buildHero()
    this.setupInput()
    this.buildCoreHUD()
    this.txtZone = this.add.text(16, 14, '', this.font(13,'#ffd34d')).setDepth(20)
    this.txtRoom = this.add.text(16, 38, '', this.font(10)).setDepth(20)
    this.refreshCoreHUD()
    this.spawnRoom()
  }

  update(time: number, delta: number): void { this.baseUpdate(time, delta) }

  protected menuOptions() {
    return [
      { label:'CONTINUE EXPEDITION', color:'#5ec05e', onPick: () => {} },
      { label:'DUNGEON: FORSAKEN CRYPT', color:'#c45aff', onPick: () => this.exitTo('Dungeon') },
      { label:'BACK TO CAMP', onPick: () => this.exitTo('Lobby') },
    ]
  }

  private spawnRoom(): void {
    const scale = 1 + (this.zone-1)*0.45 + (this.room-1)*0.12
    const total = 5 + Math.min(this.room, 3)
    const pool  = ENEMY_TYPES.slice(0, Math.min(1 + this.room, 3))
    this.enemies = this.spawnPacks(total, scale, pool)
    this.txtZone.setText(`ZONE ${this.zone}`)
    this.txtRoom.setText(`ROOM ${this.room}/3  •  ${this.enemies.length} ENEMIES`)
  }

  protected onEnemyKilled(e: { gold: number; maxHp: number }): void {
    const gold = e.gold
    this.sessionGold += gold
    this.floatDamage((e as any).x, (e as any).y - 70, 0, '#ffd34d', false)
    this.sessionXP += Math.round(4 + e.maxHp * 0.06)

    // Loot roll
    if (Math.random() < DROP_CHANCE) {
      const rarity = (Math.random() < UNCOMMON_ODDS && this.zone > 1) ? 'Uncommon' : 'Common'
      const pool = EXPEDITION_ITEM_POOLS[rarity]
      if (pool?.length) {
        const itemName = Phaser.Utils.Array.GetRandom(pool)
        // Map name to template ID by finding it in inventory templates
        // We store the name directly; server will look up by name
        this.sessionItems.push(itemName)
        this.banner(itemName.toUpperCase(), rarity === 'Uncommon' ? '#5ec05e' : '#b8c0cc')
      }
    }
  }

  protected onRoomCleared(): void {
    const zoneDone = this.room === 3
    this.banner(zoneDone ? `ZONE ${this.zone} COMPLETE!` : 'ROOM CLEAR!',
      zoneDone ? '#ffd34d' : '#5ec05e')
    this.spawnPortal()
  }

  protected nextRoom(): void {
    this.removePortal()
    if (this.room === 3) {
      this.zone++; this.room = 1
      this.hero.hp = this.hero.maxHp
    } else {
      this.room++
    }
    this.enemies = []
    this.spawnRoom()
  }

  protected onHeroDown(): void {
    if (this.busy) return
    this.busy = true
    this.banner('DEFEAT...', '#c03a3a')
    this.tweens.add({ targets:this.hero.doll, angle:-90, alpha:0.4, duration:400 })
    this.time.delayedCall(2000, () => this.finishSession())
  }

  private async exitTo(scene: string): Promise<void> {
    this.menuOpen = false
    await this.finishSession()
    this.scene.start(scene)
  }

  private async finishSession(): Promise<void> {
    const run = GameState.instance.expeditionRun
    if (!run) { this.scene.start('Lobby'); return }
    try {
      const result = await completeExpedition(run.id, this.sessionXP, this.sessionGold, this.sessionItems)
      GameState.instance.character = result.character
      GameState.instance.inventory.push(...result.items_added)
    } catch { /* best-effort */ }
    this.scene.start('Lobby')
  }
}
```

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | grep -E "^.*error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/ExpeditionScene.ts
git commit -m "feat(client): add ExpeditionScene with active combat and session rewards"
```

---

## Task 22: DungeonScene

**Files:**
- Create: `client/src/scenes/DungeonScene.ts`

- [ ] **Step 1: Create DungeonScene.ts**

```typescript
// client/src/scenes/DungeonScene.ts
import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES, W, ARENA } from './BaseCombat'
import { GameState } from '../state/GameState'
import { request } from '../api/client'
import type { CompleteExpeditionResult } from '../types/api'

const DUNGEON_ITEM_POOL = ['Crypt Blade',"Watcher's Helm",'Sepulchral Ring','Silent Boots']
const EPIC_POOL         = ["Crypt Lord's Mantle",'Profane Axe','Crown of Bones']
const TOTAL_ROOMS       = 6

export class DungeonScene extends BaseCombat {
  private roomIndex = 0
  private txtRoom!: Phaser.GameObjects.Text

  constructor() { super({ key: 'Dungeon' }) }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.busy = false; this.menuOpen = false; this.portal = null
    this.sessionXP = 0; this.sessionGold = 0; this.sessionItems = []
    this.roomIndex = 0

    this.buildArena(0x2a1a18)
    this.buildHero()
    this.setupInput()
    this.buildCoreHUD()
    this.txtRoom = this.add.text(16, 14, '', this.font(13,'#c45aff')).setDepth(20)
    this.refreshCoreHUD()
    this.spawnDungeonRoom()
  }

  update(time: number, delta: number): void { this.baseUpdate(time, delta) }

  protected menuOptions() {
    return [
      { label:'CONTINUE DUNGEON', color:'#c45aff', onPick: () => {} },
      { label:'ABANDON (lose loot)', color:'#c03a3a', onPick: () => this.scene.start('Lobby') },
    ]
  }

  private spawnDungeonRoom(): void {
    const scale  = 1 + this.roomIndex * 0.3
    const isBoss = this.roomIndex === TOTAL_ROOMS - 1
    const total  = isBoss ? 1 : 4 + Math.min(this.roomIndex, 3)
    // Use harder enemies for later rooms
    const pool = isBoss
      ? [{ ...ENEMY_TYPES[2], key:'boss', name:'Crypt Boss', hp:300, atk:22, atkSpeed:2.5, gold:50, speed:60, aggro:300, range:70 }]
      : ENEMY_TYPES.slice(1, 3)  // bats + skeletons only
    this.enemies = this.spawnPacks(total, scale, pool)
    this.txtRoom.setText(isBoss ? 'BOSS ROOM' : `CRYPT ROOM ${this.roomIndex+1}/${TOTAL_ROOMS}`)
  }

  protected onEnemyKilled(e: { gold: number; maxHp: number }): void {
    this.sessionGold += e.gold
    this.sessionXP   += Math.round(8 + e.maxHp * 0.1)
    // Drop chance: 20% Rare, 5% Epic per enemy
    const roll = Math.random()
    if (roll < 0.05) {
      this.sessionItems.push(Phaser.Utils.Array.GetRandom(EPIC_POOL))
    } else if (roll < 0.20) {
      this.sessionItems.push(Phaser.Utils.Array.GetRandom(DUNGEON_ITEM_POOL))
    }
  }

  protected onRoomCleared(): void {
    if (this.roomIndex >= TOTAL_ROOMS - 1) {
      this.banner('DUNGEON COMPLETE!', '#ffd34d')
      this.time.delayedCall(1500, () => this.finishSession())
    } else {
      this.banner('ROOM CLEAR!', '#5ec05e')
      this.spawnPortal()
    }
  }

  protected nextRoom(): void {
    this.removePortal()
    this.roomIndex++
    this.enemies = []
    this.spawnDungeonRoom()
  }

  protected onHeroDown(): void {
    if (this.busy) return
    this.busy = true
    this.banner('DEFEATED — loot lost', '#c03a3a')
    this.tweens.add({ targets:this.hero.doll, angle:-90, alpha:0.4, duration:400 })
    // On death: no loot, just return
    this.time.delayedCall(2000, () => this.scene.start('Lobby'))
  }

  private async finishSession(): Promise<void> {
    const char = GameState.instance.character!
    try {
      // Use dungeon complete endpoint
      const result = await request<CompleteExpeditionResult>(
        'POST', `/dungeon-complete`, {
          character_id: char.id,
          xp:    this.sessionXP,
          gold:  this.sessionGold,
          items: this.sessionItems,
        })
      GameState.instance.character = result.character
      GameState.instance.inventory.push(...result.items_added)
    } catch { /* best-effort */ }
    this.scene.start('Lobby')
  }
}
```

> **Note:** `POST /dungeon-complete` endpoint mirrors `/expedition-runs/{id}/complete` but without needing an active run ID. Add this handler in `cmd/server/handler_dungeons.go` following the same pattern as `handleCompleteExpedition` — takes `{ character_id, xp, gold, items[] }` and applies them transactionally. Register as `mux.HandleFunc("POST /dungeon-complete", s.handleCompleteDungeon)`.

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | grep -E "^.*error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Add dungeon complete handler to server**

Add `cmd/server/handler_dungeons.go` handler (or append to existing file):

```go
// POST /dungeon-complete
type completeDungeonRequest struct {
    CharacterID string   `json:"character_id"`
    XP          int      `json:"xp"`
    Gold        int      `json:"gold"`
    Items       []string `json:"items"`
}

func (s *server) handleCompleteDungeon(w http.ResponseWriter, r *http.Request) {
    var req completeDungeonRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CharacterID == "" {
        writeError(w, http.StatusBadRequest, "character_id, xp, gold required")
        return
    }
    if req.XP < 0 || req.Gold < 0 {
        writeError(w, http.StatusBadRequest, "xp and gold must be non-negative")
        return
    }

    tx, err := s.pool.Begin(r.Context())
    if err != nil {
        writeError(w, http.StatusInternalServerError, "transaction error")
        return
    }
    defer tx.Rollback(r.Context())

    sc, err := s.loadChar(r.Context(), req.CharacterID)
    if errors.Is(err, pgx.ErrNoRows) {
        writeError(w, http.StatusNotFound, "character not found")
        return
    }
    if err != nil {
        log.Printf("complete dungeon load char: %v", err)
        writeError(w, http.StatusInternalServerError, "could not load character")
        return
    }
    sc.c.XP  += req.XP
    sc.gold  += req.Gold
    character.CheckLevelUp(sc.c, character.NopLevelUpHandler{})

    _, err = tx.Exec(r.Context(), `
        UPDATE characters
        SET xp=$1, xp_to_next=$2, level=$3, gold=$4,
            hp=$5, max_hp=$6, attack=$7, defense=$8, critical=$9, cdr=$10
        WHERE id=$11
    `, sc.c.XP, sc.c.XPToNext, sc.c.Level, sc.gold,
        sc.c.HP, sc.c.MaxHP, sc.c.Attack, sc.c.Defense, sc.c.Critical, sc.c.CDR,
        req.CharacterID)
    if err != nil {
        log.Printf("complete dungeon update: %v", err)
        writeError(w, http.StatusInternalServerError, "could not update character")
        return
    }

    var itemsAdded []inventoryItemResponse
    for _, templateID := range req.Items {
        var item inventoryItemResponse
        err = tx.QueryRow(r.Context(), `
            INSERT INTO inventory_items (character_id, item_template_id) VALUES ($1,$2)
            RETURNING id, character_id, item_template_id
        `, req.CharacterID, templateID).Scan(&item.ID, &item.CharacterID, &item.ItemTemplateID)
        if err != nil { continue }
        tx.QueryRow(r.Context(), `
            SELECT id,name,slot,rarity,source,attack_bonus,defense_bonus,hp_bonus,crit_bonus,cdr_bonus
            FROM item_templates WHERE id=$1
        `, templateID).Scan(
            &item.Template.ID,&item.Template.Name,&item.Template.Slot,
            &item.Template.Rarity,&item.Template.Source,
            &item.Template.AttackBonus,&item.Template.DefenseBonus,&item.Template.HPBonus,
            &item.Template.CritBonus,&item.Template.CDRBonus,
        )
        itemsAdded = append(itemsAdded, item)
    }

    if err = tx.Commit(r.Context()); err != nil {
        writeError(w, http.StatusInternalServerError, "commit failed")
        return
    }

    scEff, _ := s.loadCharEffective(r.Context(), req.CharacterID)
    if itemsAdded == nil { itemsAdded = []inventoryItemResponse{} }
    writeJSON(w, http.StatusOK, completeExpeditionResponse{
        Character: scEff.toResponse(), ItemsAdded: itemsAdded,
    })
}
```

Register in `main.go`: `mux.HandleFunc("POST /dungeon-complete", s.handleCompleteDungeon)`

- [ ] **Step 4: Build server**

```bash
go build ./cmd/server/...
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/DungeonScene.ts cmd/server/handler_dungeons.go cmd/server/main.go
git commit -m "feat: add DungeonScene (client) and POST /dungeon-complete (server)"
```

---

## Task 23: Wire everything in main.ts

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Update main.ts**

Replace full content of `client/src/main.ts`:

```typescript
import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { CharacterCreateScene } from './scenes/CharacterCreateScene'
import { LobbyScene } from './scenes/LobbyScene'
import { CharacterSheetScene } from './scenes/CharacterSheetScene'
import { ExpeditionScene } from './scenes/ExpeditionScene'
import { DungeonScene } from './scenes/DungeonScene'

new Phaser.Game({
  type:            Phaser.AUTO,
  width:           960,
  height:          540,
  backgroundColor: '#0b0a12',
  parent:          document.body,
  dom:             { createContainer: true },
  scene: [
    BootScene,
    CharacterSelectScene,
    CharacterCreateScene,
    LobbyScene,
    CharacterSheetScene,
    ExpeditionScene,
    DungeonScene,
  ],
})
```

- [ ] **Step 2: Update CharacterSheetScene back button to go to Lobby**

In `CharacterSheetScene.ts`, ensure the back button targets `'Lobby'` not `'Hub'`:

```typescript
backBtn.on('pointerdown', () => this.scene.start('Lobby'))
```

- [ ] **Step 3: Delete old HubScene (no longer needed)**

```bash
rm client/src/scenes/HubScene.ts
```

- [ ] **Step 4: Final build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 5: Run all client tests**

```bash
cd client && npm test -- --run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/main.ts client/src/scenes/CharacterSheetScene.ts
git rm client/src/scenes/HubScene.ts
git commit -m "feat(client): wire all scenes in main.ts, remove HubScene"
```

---

## Slice 4 Complete ✓

Full active-combat client shipped:
- `BaseCombat` — click-to-move, enemy AI, skill casting (whirlwind + charge), VFX
- `LobbyScene` — camp with walk-up POIs (expedition, dungeon, shop, character sheet)
- `ExpeditionScene` — active combat, loot drops, reports to `/expedition-runs/{id}/complete`
- `DungeonScene` — 6-room dungeon, boss room, Rare/Epic loot, reports to `/dungeon-complete`
- `CharacterSheetScene` — 3 tabs (stats/inventory/skills) with paper doll
- `main.ts` — all scenes registered, game canvas resized to 960×540

**Next:** [Slice 5 — Presence System](2026-06-12-v6-slice5-presence.md)
