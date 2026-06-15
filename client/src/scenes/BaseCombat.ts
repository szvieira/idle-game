import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import type { EquipmentSlot } from '../types/api'

export const W = 960, H = 540
export const FONT = '"Exo 2", sans-serif'
export const ARENA = { x1: 50, y1: 140, x2: 910, y2: 500 }
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
  whirlwind:    { name:'WHIRLWIND',    mult:2.2, cd:6.0, mpCost:35, type:'aoe' },
  charge:       { name:'CHARGE',       mult:3.4, cd:5.0, mpCost:25, type:'dash' },
  fireball:     { name:'FIREBALL',     mult:2.8, cd:5.0, mpCost:30, type:'aoe' },
  meteor:       { name:'METEOR',       mult:4.5, cd:9.0, mpCost:55, type:'aoe' },
  holy_smite:   { name:'HOLY SMITE',   mult:2.5, cd:5.5, mpCost:30, type:'aoe' },
  divine_shield:{ name:'DIVINE SHIELD',mult:0.0, cd:8.0, mpCost:40, type:'dash' },
}

export interface CombatEnemyDef {
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

export const ENEMY_TYPES: CombatEnemyDef[] = [
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
  dollOffX: number; dollOffY: number  // visual-only offset for lunge / shake
  doll: PaperDollContainer
  shadow: Phaser.GameObjects.Ellipse
  hpBar: Phaser.GameObjects.Graphics
}

export interface EnemyState {
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

  private breathTween: Phaser.Tweens.Tween | null = null
  private divineShieldUntil = 0

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
  protected sessionItems: string[] = []  // item template names

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

    const doll = new PaperDollContainer(this, 220, 430, char.class)
    doll.setDepth(3)
    // Apply equipped items to doll
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as EquipmentSlot, item.template.name)
    }

    this.hero = {
      maxHp: char.max_hp,  hp: char.hp,
      maxMp: 100,          mp: 100,
      atk:   char.attack,  def:  char.defense,
      crit:  char.critical / 100,
      critMult: 2.0,       cdr:  char.cdr / 100,
      speed: 175,
      nextAtk: 0, skillReady: 0, castLock: 0,
      x: 220, y: 430,
      dollOffX: 0, dollOffY: 0,
      doll,
      shadow: this.add.ellipse(220, 462, 50, 12, 0x000000, 0.35).setDepth(1),
      hpBar:  this.add.graphics().setDepth(8),
    }

    // Idle breath — subtle vertical bob
    this.breathTween = this.tweens.add({
      targets: this.hero, dollOffY: -3,
      duration: 1100, ease: 'Sine.inOut', yoyo: true, repeat: -1,
    })
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

    this.txtBanner = this.add.text(W/2, 130, '', this.font(18,'#ffd34d'))
      .setOrigin(0.5).setDepth(30).setAlpha(0)

    // Menu button
    this.add.text(W/2, 18, '= MENU', this.font(11))
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
    h.doll.setPosition(h.x + h.dollOffX, h.y + h.dollOffY)
    h.shadow.setPosition(h.x + h.dollOffX * 0.5, h.y + 32)
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
    if (!this.hero) return
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

      // Visual lunge toward enemy and snap back
      const lx = (enemy.x - h.x) / Math.max(d, 1) * 16
      const ly = (enemy.y - h.y) / Math.max(d, 1) * 10
      this.tweens.add({
        targets: h, dollOffX: h.dollOffX + lx, dollOffY: h.dollOffY + ly,
        duration: 70, ease: 'Cubic.out', yoyo: true, onComplete: () => { h.dollOffX = 0 },
      })

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
    // Block damage if Divine Shield is active
    if (this.time.now < this.divineShieldUntil) {
      const block = this.add.text(h.x, h.y - 50, 'BLOCKED', this.font(10, '#ffd34d'))
        .setOrigin(0.5).setDepth(20)
      this.tweens.add({ targets: block, y: h.y - 90, alpha: 0, duration: 600,
        onComplete: () => block.destroy() })
      return
    }
    const dmg = Math.max(1, Math.round(e.atk * (0.85 + Math.random()*0.3) - h.def))
    h.hp = Math.max(0, h.hp - dmg)

    // Horizontal shake stagger
    const shakeX = e.x < h.x ? 10 : -10
    this.tweens.add({
      targets: h, dollOffX: shakeX, duration: 40, ease: 'Quad.out',
      yoyo: true, repeat: 1, onComplete: () => { h.dollOffX = 0 },
    })
    this.tweens.add({ targets: h.doll, alpha: 0.4, duration: 50, yoyo: true })
    this.floatDamage(h.x, h.y - 56, dmg, '#ff7a6e', false)
    this.cameras.main.shake(60, 0.002)
    if (h.hp <= 0) this.onHeroDown()
  }

  applyDamage(e: EnemyState, dmg: number, isCrit: boolean, color?: string): void {
    if (e.dead) return
    e.hp -= dmg; e.angry = true
    this.hitFlash(e.sprite)
    this.floatDamage(e.x, e.y - e.barOff - 4, dmg, color ?? (isCrit ? '#ffffff' : '#ffdd88'), isCrit)
    if (isCrit) {
      const flash = this.add.rectangle(W/2, H/2, W, H, 0xffffff, 0).setDepth(25)
      this.tweens.add({ targets: flash, alpha: 0.12, duration: 35, yoyo: true,
        onComplete: () => flash.destroy() })
    }
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e: EnemyState): void {
    e.dead = true; e.hp = 0; e.hpBar.clear()
    e.shadow.destroy()

    const key = e.sprite.texture.key.replace('spr_', '')
    if (key === 'slime') {
      this.tweens.add({ targets: e.sprite, scaleX: 2.2, scaleY: 0.1, y: `+=18`, alpha: 0,
        duration: 380, ease: 'Cubic.out', onComplete: () => e.sprite.destroy() })
    } else if (key === 'bat') {
      this.tweens.add({ targets: e.sprite, y: `+=55`, angle: Phaser.Math.Between(-200, 200),
        alpha: 0, scale: 0.2, duration: 450, ease: 'Quad.in', onComplete: () => e.sprite.destroy() })
    } else if (key === 'skeleton') {
      this.tweens.add({ targets: e.sprite, alpha: 0, scale: 0.1, y: `+=6`,
        duration: 300, ease: 'Quad.in', onComplete: () => e.sprite.destroy() })
      for (let i = 0; i < 6; i++) {
        const chip = this.add.rectangle(
          e.x + Phaser.Math.Between(-18, 18), e.y + Phaser.Math.Between(-12, 8),
          Phaser.Math.Between(3, 6), 2, 0xe8e2d0).setDepth(9)
        this.tweens.add({ targets: chip,
          x: `+=${Phaser.Math.Between(-44, 44)}`, y: `+=${Phaser.Math.Between(8, 44)}`,
          alpha: 0, duration: 400, onComplete: () => chip.destroy() })
      }
    } else {
      this.tweens.add({ targets: e.sprite, alpha: 0, y: `+=14`, angle: 90,
        duration: 350, onComplete: () => e.sprite.destroy() })
    }

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
    const { enemy: target } = this.nearestEnemy(h)
    switch (GameState.instance.skills.equipped_skill) {
      case 'whirlwind':     h.castLock = now + 650; this.castWhirlwind(); break
      case 'charge':        h.castLock = now + 520; this.castCharge(); break
      case 'fireball':      h.castLock = now + 500; if (target) this.castFireball(target); break
      case 'meteor':        h.castLock = now + 600; if (target) this.castMeteor(target); break
      case 'holy_smite':    h.castLock = now + 500; if (target) this.castHolySmite(target); break
      case 'divine_shield': h.castLock = now + 400; this.castDivineShield(); break
      default:              h.castLock = now + 650; this.castWhirlwind(); break
    }
  }

  private castWhirlwind(): void {
    const h = this.hero
    this.banner('WHIRLWIND!', '#7fd4ff')
    this.tweens.add({ targets: h.doll, angle: 720, duration: 520, ease: 'Cubic.out',
      onComplete: () => h.doll.setAngle(0) })

    // Expanding ring
    const ring = this.add.circle(h.x, h.y, 12).setDepth(9).setStrokeStyle(6, 0x7fd4ff, 1)
    this.tweens.add({ targets: ring, radius: SKILL_RADIUS, alpha: 0, duration: 480, ease: 'Quad.out',
      onUpdate: () => ring.setStrokeStyle(6, 0x7fd4ff, Math.max(ring.alpha, 0)),
      onComplete: () => ring.destroy() })

    // Spiral particles orbiting outward
    const count = 10
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const p = this.add.circle(
        h.x + Math.cos(angle) * 18, h.y + Math.sin(angle) * 18,
        Phaser.Math.Between(3, 6), 0x7fd4ff).setDepth(10).setAlpha(0.9)
      this.tweens.add({
        targets: p,
        x: h.x + Math.cos(angle) * SKILL_RADIUS,
        y: h.y + Math.sin(angle) * SKILL_RADIUS,
        alpha: 0, scale: 0.2,
        duration: 440, delay: i * 18, ease: 'Quad.out',
        onComplete: () => p.destroy(),
      })
    }

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
    this.tweens.add({ targets: h, x: tx, y: ty, duration: 220, ease: 'Cubic.in',
      onUpdate: () => {
        this.syncHero()
        // Motion trail
        if (Math.random() < 0.5) {
          const tr = this.add.circle(h.x, h.y, Phaser.Math.Between(4, 7), 0xffd34d, 0.55).setDepth(2)
          this.tweens.add({ targets: tr, alpha: 0, scale: 0.1, duration: 180,
            onComplete: () => tr.destroy() })
        }
      },
      onComplete: () => {
        this.cameras.main.shake(150, 0.008)
        const dmg = Math.round(h.atk * this.skill.mult)
        this.applyDamage(enemy, dmg, true, '#ffd34d')
        this.enemiesWithin(enemy, 70).forEach(e => {
          if (e !== enemy) this.applyDamage(e, Math.round(dmg * 0.4), false, '#ffd34d')
        })
      },
    })
  }

  private castFireball(e: EnemyState): void {
    const ball = this.add.circle(this.hero.x, this.hero.y, 10, 0xff6a00, 1).setDepth(10)
    const trail = this.add.circle(this.hero.x, this.hero.y, 14, 0xff3300, 0.4).setDepth(9)
    this.tweens.add({
      targets: trail, x: e.x, y: e.y, duration: 280, ease: 'Quad.in',
      onComplete: () => trail.destroy()
    })
    this.tweens.add({
      targets: ball, x: e.x, y: e.y, duration: 260, ease: 'Quad.in',
      onComplete: () => {
        ball.destroy()
        // Explosion: 6 sparks
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2
          const sp = this.add.circle(e.x, e.y, 5, 0xff8800, 1).setDepth(10)
          this.tweens.add({
            targets: sp,
            x: e.x + Math.cos(ang) * 30, y: e.y + Math.sin(ang) * 30,
            alpha: 0, scale: 0.3, duration: 250, ease: 'Quad.out',
            onComplete: () => sp.destroy()
          })
        }
        // Central burst
        const burst = this.add.circle(e.x, e.y, 22, 0xff5500, 0.7).setDepth(10)
        this.tweens.add({ targets: burst, scale: 2.5, alpha: 0, duration: 300, onComplete: () => burst.destroy() })
      }
    })
  }

  private castMeteor(e: EnemyState): void {
    // Warning ring on ground
    const warn = this.add.circle(e.x, e.y, 44, 0xff2200, 0).setDepth(8)
      .setStrokeStyle(3, 0xff4400, 0.6)
    this.tweens.add({ targets: warn, alpha: 0.3, duration: 400, yoyo: true, repeat: 1,
      onComplete: () => warn.destroy() })
    // Meteor falling from above
    const rock = this.add.circle(e.x, e.y - 220, 26, 0xcc2200, 1).setDepth(11)
    const glow = this.add.circle(e.x, e.y - 220, 38, 0xff6600, 0.4).setDepth(10)
    this.tweens.add({ targets: glow, y: e.y, alpha: 0, duration: 480, ease: 'Quad.in',
      onComplete: () => glow.destroy() })
    this.tweens.add({
      targets: rock, y: e.y, duration: 480, ease: 'Quad.in',
      onComplete: () => {
        rock.destroy()
        // Shockwave ring
        const ring = this.add.circle(e.x, e.y, 10, 0xff4400, 0).setDepth(10)
          .setStrokeStyle(4, 0xff6600, 0.8)
        this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 380, ease: 'Quad.out',
          onComplete: () => ring.destroy() })
        // Screen flash
        const flash = this.add.rectangle(this.hero.x, this.hero.y, 960, 540, 0xff3300, 0.1)
          .setDepth(25)
        this.tweens.add({ targets: flash, alpha: 0, duration: 160, onComplete: () => flash.destroy() })
        // 8 debris particles
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2
          const d = this.add.rectangle(e.x, e.y, 6, 6, 0xaa3300).setDepth(10)
          this.tweens.add({
            targets: d,
            x: e.x + Math.cos(ang) * 50, y: e.y + Math.sin(ang) * 50,
            alpha: 0, angle: 180, duration: 400, ease: 'Quad.out',
            onComplete: () => d.destroy()
          })
        }
      }
    })
  }

  private castHolySmite(e: EnemyState): void {
    // Golden burst rings
    for (let r = 0; r < 3; r++) {
      const ring = this.add.circle(this.hero.x, this.hero.y, 10 + r * 10, 0xffd34d, 0)
        .setStrokeStyle(3, 0xffd34d, 0.7).setDepth(8)
      this.tweens.add({
        targets: ring, scale: 3 + r * 0.5, alpha: 0, duration: 380,
        delay: r * 60, ease: 'Quad.out', onComplete: () => ring.destroy()
      })
    }
    // Ray toward enemy
    const ray = this.add.rectangle(
      (this.hero.x + e.x) / 2, (this.hero.y + e.y) / 2,
      Phaser.Math.Distance.Between(this.hero.x, this.hero.y, e.x, e.y),
      6, 0xffd34d, 0.7
    ).setDepth(9)
    const ang = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, e.x, e.y)
    ray.setRotation(ang)
    this.tweens.add({ targets: ray, alpha: 0, scaleX: 0.3, duration: 300, onComplete: () => ray.destroy() })
    // Heal text (if Paladin heals on this skill)
    const healAmt = GameState.instance.character?.class === 'Paladin' ? '+heal' : ''
    if (healAmt) {
      const ht = this.add.text(this.hero.x, this.hero.y - 40, '+HP', this.font(10, '#88ff88'))
        .setOrigin(0.5).setDepth(20)
      this.tweens.add({ targets: ht, y: this.hero.y - 80, alpha: 0, duration: 800, onComplete: () => ht.destroy() })
    }
  }

  private castDivineShield(): void {
    this.divineShieldUntil = this.time.now + 3000
    // Outer aura
    const aura = this.add.circle(this.hero.x, this.hero.y, 44, 0xffd34d, 0.25).setDepth(2)
    const ring = this.add.circle(this.hero.x, this.hero.y, 44, 0xffd34d, 0)
      .setStrokeStyle(3, 0xffd34d, 0.9).setDepth(3)
    this.tweens.add({ targets: aura, alpha: 0.05, scale: 1.1, duration: 600, yoyo: true, repeat: 2,
      onComplete: () => aura.destroy() })
    this.tweens.add({ targets: ring, scale: 1.15, alpha: 0, duration: 400, yoyo: false,
      onComplete: () => ring.destroy() })
    // "DIVINE SHIELD" banner
    this.banner('DIVINE SHIELD', '#ffd34d')
  }

  // ── VFX ─────────────────────────────────────────────────────────────────────
  slashFx(x: number, y: number, crit: boolean): void {
    const count  = crit ? 8 : 4
    const colors = crit ? [0xffffff, 0xffe4a3, 0xffd34d] : [0xffdd88, 0xffa726, 0xff7a6e]
    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)]
      const r = crit ? Phaser.Math.Between(3, 7) : Phaser.Math.Between(2, 4)
      const p = this.add.circle(
        x + Phaser.Math.Between(-20, 20), y + Phaser.Math.Between(-20, 20),
        r, color).setDepth(9).setAlpha(0.9)
      this.tweens.add({
        targets: p,
        x: `+=${Phaser.Math.Between(-38, 38)}`,
        y: `+=${Phaser.Math.Between(-32, 20)}`,
        alpha: 0, scale: 0.1,
        duration: crit ? 520 : 340,
        ease: 'Quad.out',
        onComplete: () => p.destroy(),
      })
    }
  }

  private hitFlash(sprite: Phaser.GameObjects.Image): void {
    this.tweens.add({ targets: sprite, alpha: 0.15, duration: 55, yoyo: true })
    sprite.setTint(0xff8888)
    this.time.delayedCall(110, () => sprite.clearTint())
  }

  floatDamage(x: number, y: number, dmg: number, color: string, crit: boolean): void {
    const size = crit ? 16 : 12
    const txt = this.add.text(x, y, String(dmg), this.font(size, color)).setOrigin(0.5).setDepth(15)
    this.tweens.add({ targets:txt, y:y-48, alpha:0, duration:crit?900:700,
      ease:'Quad.out', onComplete: () => txt.destroy() })
  }

  floatText(x: number, y: number, text: string, color: string): void {
    const txt = this.add.text(x, y, text, this.font(10, color)).setOrigin(0.5).setDepth(15)
    this.tweens.add({ targets:txt, y:y-40, alpha:0, duration:800,
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
  spawnEnemyObj(def: CombatEnemyDef, scale: number, pos: {x:number;y:number}): EnemyState {
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

  spawnPacks(total: number, scale: number, pool: CombatEnemyDef[]): EnemyState[] {
    const enemies: EnemyState[] = []
    let remaining = total
    const centers: {x:number;y:number}[] = []
    while (remaining > 0) {
      const packSize = Math.min(remaining, Phaser.Math.Between(2,3))
      remaining -= packSize
      let cx=0, cy=0, tries=0
      do {
        cx = Phaser.Math.Between(ARENA.x1+250, ARENA.x2-40)
        cy = Phaser.Math.Between(ARENA.y1+40, ARENA.y2-50)
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
