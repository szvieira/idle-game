import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { W, H, FONT } from './BaseCombat'
import type { EquipmentSlot } from '../types/api'

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

    this.pois = []
    this.locked = false
    this.moveTo = null

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
      if (item) doll.equip(slot as EquipmentSlot, item.template.name)
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
    })
    // Close — move hero away from POI before unlocking so it doesn't re-trigger
    const close = this.add.rectangle(W/2, 420, 120, 36, 0x334455).setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor:true })
    overlay.add(close)
    overlay.add(this.add.text(W/2, 420, 'CLOSE', this.font(10)).setOrigin(0.5))
    close.on('pointerdown', () => {
      overlay.destroy()
      this.hero.x = W/2; this.hero.y = 472
      this.moveTo = null
      this.locked = false
    })
  }
}
