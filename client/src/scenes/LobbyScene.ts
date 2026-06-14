import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { VISUAL_SLOTS } from '../combat/sprites'
import { PresenceSocket } from '../net/PresenceSocket'
import { getInventory, getEquipped, equipItem, unequipItem } from '../api/items'
import { getSkills, unlockSkill, equipSkill } from '../api/skills'
import { getDungeons } from '../api/dungeons'
import { buildDungeonList } from './ExpeditionScene'
import { W, H, FONT } from './BaseCombat'
import type { EquipmentSlot, InventoryItem, ItemTemplate } from '../types/api'
import type { PlayerSnap } from '../net/PresenceSocket'

const WORLD_W = 1920
const WORLD_H = 800
const LOBBY_ARENA = { x1: 80, y1: 380, x2: 1840, y2: 760 }
const BASE = 'http://localhost:8080'

const RARITY_COLOR: Record<string, number> = {
  Common: 0xb8c0cc, Uncommon: 0x5ec05e, Rare: 0x4da3ff, Epic: 0xc45aff, Legendary: 0xffa500,
}

// Pin a container and ALL its descendants to the camera (scrollFactor 0).
// Container.setScrollFactor(x, y, true) is unreliable: it uses Array SetAll,
// which only updates `scrollFactorX/Y` when they are own properties. They live
// on the prototype by default, so children keep scrollFactor 1 — breaking input
// hit-testing in a scrolling camera. Calling the method per object fixes it.
function pinToCamera(obj: Phaser.GameObjects.GameObject): void {
  const o = obj as Phaser.GameObjects.GameObject & {
    setScrollFactor?: (x: number, y?: number) => unknown
    list?: Phaser.GameObjects.GameObject[]
  }
  o.setScrollFactor?.(0, 0)
  o.list?.forEach(pinToCamera)
}

// Equipment slot grid: 2 columns × 3 rows in the modal left panel
const EQ_GRID = [
  ['Helmet', 'Ring'],
  ['Weapon', 'Amulet'],
  ['Armor',  'Boots'],
] as const


interface OtherPlayer {
  doll: PaperDollContainer
  label: Phaser.GameObjects.Text
  targetX: number
  targetY: number
}

interface LobbyMember {
  character_id: string
  name: string
  class: string
  is_leader: boolean
}

interface LobbyState {
  id: string
  invite_code: string
  status: string
  leader_character_id: string
  run_id?: string
  members: LobbyMember[]
}

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
  private poiCooldownUntil = 0
  private presence: PresenceSocket | null = null
  private otherPlayers: Map<string, OtherPlayer> = new Map()
  private lobbyPollInterval: ReturnType<typeof setInterval> | null = null

  // Character modal state
  private charWidgetDoll: PaperDollContainer | null = null
  private modalDolls: PaperDollContainer[] = []
  private activeModal: Phaser.GameObjects.Container | null = null
  private modalFromPoi = false
  private charModalTab: 'inventory' | 'skills' = 'inventory'

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
    this.otherPlayers.clear()
    this.activeModal = null
    this.modalDolls = []

    this.buildCamp()
    this.buildHeroAvatar()
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.hero.doll, true, 0.08, 0.08)
    this.cameras.main.setDeadzone(100, 70)
    this.buildPOIs()
    this.buildTopUI()
    this.buildCharWidget()
    this.setupInput()
    this.setupPresence()
    this.events.once('shutdown', () => this.shutdownScene())
  }

  private buildCamp(): void {
    const g = this.add.graphics().setDepth(-6)

    // Sky
    g.fillStyle(0x0d1220, 1)
    g.fillRect(0, 0, WORLD_W, WORLD_H)

    // Stars
    g.fillStyle(0xe8e2d0, 0.8)
    for (let i = 0; i < 160; i++)
      g.fillRect(Phaser.Math.Between(0, WORLD_W), Phaser.Math.Between(0, 290), 2, 2)

    // Back mountain silhouettes (dark blue-grey)
    g.fillStyle(0x1c2435, 1)
    const peaksBack = [0,240,460,700,960,1220,1460,1700,1920]
    for (let i = 0; i < peaksBack.length - 1; i++) {
      const lx = peaksBack[i], rx = peaksBack[i+1], mx = (lx+rx)/2
      const ht = 140 + (i % 3) * 50
      g.fillTriangle(lx, 380, mx, 380-ht, rx, 380)
    }
    // Front mountain silhouettes (slightly darker)
    g.fillStyle(0x232c40, 1)
    const peaksFront = [-40, 200, 420, 660, 880, 1120, 1360, 1580, 1820, 1960]
    for (let i = 0; i < peaksFront.length - 1; i++) {
      const lx = peaksFront[i], rx = peaksFront[i+1], mx = (lx+rx)/2
      const ht = 80 + (i % 3) * 30
      g.fillTriangle(lx, 380, mx, 380-ht, rx, 380)
    }

    // Ground
    g.fillStyle(0x1b1622, 1)
    g.fillRect(0, 380, WORLD_W, WORLD_H - 380)
    // Horizon line
    g.fillStyle(0x2a2235, 1)
    g.fillRect(0, 380, WORLD_W, 8)
    // Tile pattern across full world
    g.fillStyle(0x232035, 0.4)
    for (let ty = 388; ty < WORLD_H; ty += 44)
      for (let tx = (ty % 88 === 0 ? 0 : 44); tx < WORLD_W; tx += 88)
        g.fillRect(tx, ty, 42, 42)

    // Stone paths from town center (960,560) to each POI
    const paths: [number,number,number,number][] = [
      [960,560, 320,470],   // dungeon
      [960,560, 1600,470],  // expedition
      [960,560, 960,395],   // raid
      [960,560, 1350,555],  // shop
      [960,560, 600,520],   // blacksmith
    ]
    for (const [x1,y1,x2,y2] of paths) {
      g.lineStyle(28, 0x252238, 0.9)
      g.strokeLineShape(new Phaser.Geom.Line(x1,y1,x2,y2))
      g.lineStyle(18, 0x2d2a44, 0.55)
      g.strokeLineShape(new Phaser.Geom.Line(x1,y1,x2,y2))
    }

    // Central plaza
    g.fillStyle(0x282440, 1)
    g.fillCircle(960, 560, 90)
    g.fillStyle(0x2f2b4a, 0.4)
    g.fillCircle(960, 560, 65)

    // ── INN building at (960, 460) ──────────────────────
    const ix = 960, iy = 460
    // Stone walls
    g.fillStyle(0x3d3555, 1)
    g.fillRect(ix-75, iy-50, 150, 85)
    // Horizontal beam
    g.fillStyle(0x2a2240, 1)
    g.fillRect(ix-75, iy-18, 150, 7)
    g.fillRect(ix-5, iy-50, 10, 85)
    // Peaked roof
    g.fillStyle(0x4a3060, 1)
    g.fillTriangle(ix-86, iy-50, ix, iy-120, ix+86, iy-50)
    // Roof shadow edge
    g.fillStyle(0x2a1a40, 1)
    g.fillRect(ix-86, iy-53, 172, 6)
    // Door
    g.fillStyle(0x120d1e, 1)
    g.fillRect(ix-18, iy-38, 36, 73)
    // Door handle
    g.fillStyle(0xd4a020, 1)
    g.fillCircle(ix+9, iy-5, 4)
    // Left window with warm glow
    g.fillStyle(0x111a33, 1)
    g.fillRect(ix-64, iy-42, 28, 20)
    g.fillStyle(0xffcc55, 0.35)
    g.fillRect(ix-64, iy-42, 28, 20)
    // Right window
    g.fillStyle(0x111a33, 1)
    g.fillRect(ix+36, iy-42, 28, 20)
    g.fillStyle(0xffcc55, 0.35)
    g.fillRect(ix+36, iy-42, 28, 20)
    // Sign above door
    g.fillStyle(0x5a3a1a, 1)
    g.fillRect(ix-30, iy-58, 60, 14)
    g.fillStyle(0x2a1a08, 1)
    g.fillRect(ix-28, iy-56, 56, 10)

    // Sign text
    this.add.text(ix, iy-50, 'INN', this.font(5,'#d4a020')).setOrigin(0.5).setDepth(-5)

    // ── Campfire in plaza ───────────────────────────────
    g.fillStyle(0x4a3b2a, 1)
    g.fillRect(951, 570, 18, 6)   // log horizontal
    g.fillRect(957, 564, 6, 18)   // log vertical
    const flame = this.add.rectangle(960, 560, 14, 20, 0xffa726).setDepth(3)
    this.tweens.add({ targets:flame, scaleY:1.5, scaleX:0.8, alpha:0.75, duration:220, yoyo:true, repeat:-1 })

    // ── Trees ───────────────────────────────────────────
    const treePositions = [[180,455],[570,430],[1380,430],[1760,455],[190,650],[1730,650]]
    for (const [tx, ty] of treePositions) {
      // Trunk
      g.fillStyle(0x3d2510, 1)
      g.fillRect(tx-6, ty, 12, 38)
      // Foliage layers (darkest at bottom, brightest at top)
      g.fillStyle(0x1a5520, 1); g.fillCircle(tx, ty-8, 28)
      g.fillStyle(0x1e6825, 1); g.fillCircle(tx, ty-24, 20)
      g.fillStyle(0x22842e, 1); g.fillCircle(tx, ty-38, 14)
    }

    // ── Merchant cart at (1350, 525) ────────────────────
    const mx = 1350, my = 525
    // Wheels
    g.fillStyle(0x3a2a14, 1)
    g.fillCircle(mx-38, my+28, 20); g.fillCircle(mx+38, my+28, 20)
    g.fillStyle(0x7a5a30, 1)
    g.fillCircle(mx-38, my+28, 15); g.fillCircle(mx+38, my+28, 15)
    g.fillStyle(0x2a1a08, 1)
    g.fillCircle(mx-38, my+28, 5);  g.fillCircle(mx+38, my+28, 5)
    // Cart body
    g.fillStyle(0x5a3820, 1); g.fillRect(mx-55, my-5, 110, 35)
    g.fillStyle(0x7a5030, 1); g.fillRect(mx-52, my-2, 104, 28)
    // Wood plank texture
    g.fillStyle(0x6a4520, 0.5)
    for (let xi = mx-52; xi < mx+52; xi += 20) g.fillRect(xi, my-2, 2, 28)
    // Counter top
    g.fillStyle(0x4a3010, 1); g.fillRect(mx-60, my-14, 120, 10)
    // Canopy poles
    g.fillStyle(0x3a2810, 1)
    g.fillRect(mx-48, my-55, 6, 44); g.fillRect(mx+42, my-55, 6, 44)
    // Striped canopy
    g.fillStyle(0xbb2820, 1); g.fillTriangle(mx-56, my-55, mx, my-95, mx+56, my-55)
    g.fillStyle(0xff4a38, 0.6)
    for (let si = 0; si < 6; si++) {
      const xL = mx - 56 + si * 19, xR = xL + 10
      const yL = my - 55, yR = my - 55
      const yM = my - 95 + si * 6
      if (xL < mx + 56) g.fillTriangle(xL, yL, (xL+xR)/2, yM, xR, yR)
    }
    // NPC merchant (left of cart)
    const npx = mx - 78, npy = my
    g.fillStyle(0xffcc88, 1); g.fillCircle(npx, npy-40, 12) // head
    g.fillStyle(0x224488, 1); g.fillRect(npx-9, npy-28, 18, 34) // body
    g.fillStyle(0x1a3360, 1); g.fillRect(npx-10, npy-8, 10, 16); g.fillRect(npx, npy-8, 10, 16) // legs
    g.fillStyle(0xffcc88, 1); g.fillRect(npx-16, npy-24, 8, 10); g.fillRect(npx+8, npy-24, 8, 10) // arms
    // Merchant hat
    g.fillStyle(0x111122, 1)
    g.fillRect(npx-13, npy-53, 26, 6)
    g.fillTriangle(npx-8, npy-53, npx, npy-70, npx+8, npy-53)

    // ── Blacksmith forge at (600, 500) ─────────────────
    const bx = 600, by = 500
    // Stone base
    g.fillStyle(0x3a3a3a, 1)
    g.fillRect(bx - 40, by - 10, 80, 30)
    // Anvil body (trapezoid approximated as overlapping rects)
    g.fillStyle(0x222222, 1)
    g.fillRect(bx - 28, by - 30, 56, 20)
    g.fillRect(bx - 20, by - 40, 40, 12)
    // Anvil horn
    g.fillStyle(0x1a1a1a, 1)
    g.fillTriangle(bx + 28, by - 26, bx + 48, by - 20, bx + 28, by - 14)
    // Glowing embers (drawn as small circles, tweened below)
    g.fillStyle(0xff6600, 0.9)
    g.fillCircle(bx - 8, by + 8, 5)
    g.fillCircle(bx + 4, by + 10, 4)
    g.fillCircle(bx + 14, by + 7, 3)

    // Animated ember glow
    const ember = this.add.ellipse(bx, by + 8, 30, 10, 0xff4400, 0.7).setDepth(2)
    this.tweens.add({ targets: ember, alpha: 0.2, scaleX: 1.3, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' })

    // Blacksmith NPC (right of forge)
    const bsnpx = bx + 55, bsnpy = by - 10
    g.fillStyle(0xd4a070, 1); g.fillCircle(bsnpx, bsnpy - 40, 12)   // head
    g.fillStyle(0x553311, 1); g.fillRect(bsnpx - 9, bsnpy - 28, 18, 34) // leather apron body
    g.fillStyle(0x221100, 1); g.fillRect(bsnpx - 10, bsnpy - 8, 10, 16); g.fillRect(bsnpx, bsnpy - 8, 10, 16) // legs
    g.fillStyle(0xd4a070, 1); g.fillRect(bsnpx - 16, bsnpy - 24, 8, 10); g.fillRect(bsnpx + 8, bsnpy - 24, 8, 10) // arms
    // Hammer in hand
    g.fillStyle(0x888888, 1); g.fillRect(bsnpx + 14, bsnpy - 32, 6, 16)
    g.fillStyle(0x555555, 1); g.fillRect(bsnpx + 10, bsnpy - 36, 14, 8)
    // Blacksmith label
    this.add.text(bx, by - 70, 'Blacksmith', this.font(8, '#cc8844')).setOrigin(0.5).setDepth(-5)

    // Fixed hint at bottom of screen
    const hint = this.add.text(W/2, H-12, 'CLICK TO WALK  •  APPROACH PORTAL TO ENTER',
      this.font(7,'#9aa8bd')).setOrigin(0.5,1).setDepth(20).setScrollFactor(0)
    this.tweens.add({ targets:hint, alpha:0.35, duration:1100, yoyo:true, repeat:-1 })
  }

  private buildHeroAvatar(): void {
    const char = GameState.instance.character!
    const doll = new PaperDollContainer(this, 960, 560, char.class)
    doll.setDepth(3)
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as EquipmentSlot, item.template.name)
    }
    this.hero = {
      x: 960, y: 560, speed: 175, doll,
      shadow: this.add.ellipse(960, 592, 50, 12, 0x000000, 0.35).setDepth(1),
    }
  }

  private addPOI(poi: POI): void {
    this.pois.push(poi)
    const ring = this.add.circle(poi.x, poi.y, poi.r).setStrokeStyle(2, poi.color, 0.3).setDepth(0)
    this.tweens.add({ targets:ring, scale:1.08, alpha:0.15, duration:900, yoyo:true, repeat:-1 })
    this.add.text(poi.x, poi.y + poi.r + 14, poi.label, this.font(8, `#${poi.color.toString(16).padStart(6,'0')}`))
      .setOrigin(0.5).setDepth(20)
  }

  private drawPortalArch(x: number, y: number, color: number): void {
    const g = this.add.graphics().setDepth(1)
    // Stone columns
    g.fillStyle(0x4a4060, 1)
    g.fillRect(x-40, y-100, 22, 100)
    g.fillRect(x+18, y-100, 22, 100)
    // Capstone
    g.fillRect(x-44, y-108, 88, 20)
    // Top shadow
    g.fillStyle(0x2a2038, 1)
    g.fillRect(x-44, y-110, 88, 6)
    // Column bases
    g.fillStyle(0x3a3050, 1)
    g.fillRect(x-44, y-8, 26, 10)
    g.fillRect(x+18, y-8, 26, 10)
    // Rune markings
    g.fillStyle(color, 0.4)
    g.fillRect(x-32, y-90, 6, 20)
    g.fillRect(x+26, y-90, 6, 20)

    // Animated portal glow
    const glow = this.add.ellipse(x, y-50, 56, 84, color, 0.55).setDepth(2)
    this.tweens.add({ targets:glow, alpha:0.2, scale:1.1, duration:1400, yoyo:true, repeat:-1, ease:'Sine.inOut' })
    const haze = this.add.ellipse(x, y-50, 80, 114, color, 0.1).setDepth(1)
    this.tweens.add({ targets:haze, alpha:0.03, scale:1.15, duration:1800, yoyo:true, repeat:-1, ease:'Sine.inOut', delay:400 })
  }

  private buildPOIs(): void {
    // Expedition portal (right side)
    this.drawPortalArch(1600, 470, 0x5ec05e)
    this.addPOI({ x:1600, y:470, r:55, color:0x5ec05e, label:'EXPEDITION',
      onEnter: () => this.scene.start('Expedition') })

    // Dungeon portal (left side)
    this.drawPortalArch(320, 470, 0xc45aff)
    this.addPOI({ x:320, y:470, r:55, color:0xc45aff, label:'DUNGEON',
      onEnter: () => void this.openDungeonSelect() })

    // Raid portal (north center, arch visually spans the horizon)
    this.drawPortalArch(960, 395, 0xff4d6d)
    this.addPOI({ x:960, y:395, r:52, color:0xff4d6d, label:'RAID',
      onEnter: () => this.openRaidDialog() })

    // Shop trigger over merchant cart
    this.addPOI({ x:1350, y:555, r:55, color:0xffd34d, label:'SHOP',
      onEnter: () => this.openShop() })

    // Character modal trigger near inn door
    this.addPOI({ x:960, y:450, r:50, color:0x9aa8bd, label:'CHARACTER',
      onEnter: () => { this.modalFromPoi = true; void this.openCharModal() } })

    // Blacksmith trigger
    this.addPOI({ x:600, y:520, r:55, color:0xcc8844, label:'BLACKSMITH',
      onEnter: () => void this.openBlacksmith() })
  }

  private buildTopUI(): void {
    const char = GameState.instance.character!
    this.add.text(20, 14, `${char.name}  Lv.${char.level}  ${char.class}`, this.font(11)).setDepth(20).setScrollFactor(0)
    this.add.text(20, 34, `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`, this.font(9,'#aaaacc')).setDepth(20).setScrollFactor(0)
  }

  // ── Character widget (top-right) ──────────────────────────────────────────

  private buildCharWidget(): void {
    const char = GameState.instance.character!
    const bg = this.add.rectangle(838, 30, 230, 46, 0x0d0a1a, 0.92)
      .setStrokeStyle(1, 0x334466)
      .setInteractive({ useHandCursor: true })
      .setDepth(22)
      .setScrollFactor(0)
    this.charWidgetDoll = this.makeWidgetDoll()
    this.add.text(793, 19, char.name, this.font(7)).setOrigin(0, 0.5).setDepth(24).setScrollFactor(0)
    this.add.text(793, 37, `Lv.${char.level}  ${char.class}`, this.font(7, '#9aa8bd')).setOrigin(0, 0.5).setDepth(24).setScrollFactor(0)
    bg.on('pointerdown', () => {
      if (this.activeModal || this.locked) return
      this.locked = true
      this.modalFromPoi = false
      void this.openCharModal()
    })
  }

  private makeWidgetDoll(): PaperDollContainer {
    const char = GameState.instance.character!
    const doll = new PaperDollContainer(this, 754, 30, char.class)
    doll.setScale(0.62).setDepth(23)
    doll.setScrollFactor(0, true)
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as EquipmentSlot, item.template.name)
    }
    return doll
  }

  private rebuildWidgetDoll(): void {
    this.charWidgetDoll?.destroy()
    this.charWidgetDoll = this.makeWidgetDoll()
  }

  // ── Character modal ────────────────────────────────────────────────────────

  private async openCharModal(): Promise<void> {
    if (this.activeModal) return
    const char = GameState.instance.character!
    try {
      const [inventory, equipped, skills] = await Promise.all([
        getInventory(char.id),
        getEquipped(char.id),
        getSkills(char.id),
      ])
      if (!this.scene.isActive('Lobby')) return
      GameState.instance.inventory = inventory
      GameState.instance.equipped  = equipped
      GameState.instance.skills    = skills
    } catch {
      this.locked = false
      return
    }
    this.buildCharModalContent()
  }

  private buildCharModalContent(): void {
    const char      = GameState.instance.character!
    const eq        = GameState.instance.equipped
    const inventory = GameState.instance.inventory
    const skills    = GameState.instance.skills

    const modal = this.add.container(0, 0).setDepth(70).setScrollFactor(0)
    this.activeModal = modal

    // Full-screen backdrop (intercepts clicks so hero doesn't move)
    modal.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85).setInteractive())

    // Modal panel background
    modal.add(this.add.rectangle(W/2, H/2, 930, 518, 0x0d0a1a).setStrokeStyle(2, 0x334466))

    // Divider between left/right panels
    const divG = this.add.graphics()
    divG.lineStyle(1, 0x334466, 0.7)
    divG.strokeLineShape(new Phaser.Geom.Line(310, 14, 310, 526))
    modal.add(divG)

    // ── Left panel (x: 20–308, center 164) ──────────────────────────────────

    // Stat block
    const statLines: [string, string, number][] = [
      [char.name,                                    '#e8e2d0', 10],
      [`Lv.${char.level}  ${char.class}`,            '#9aa8bd',  8],
      [`HP: ${char.hp} / ${char.max_hp}`,            '#888899',  7],
      [`ATK: ${char.attack}   DEF: ${char.defense}`, '#888899',  7],
      [`CRIT: ${char.critical}%   CDR: ${char.cdr}%`,'#888899', 7],
    ]
    statLines.forEach(([text, color, size], i) => {
      modal.add(this.add.text(164, 28 + i * 22, text, this.font(size, color)).setOrigin(0.5))
    })

    // PaperDoll (lives outside the container, gets its own depth)
    const modalDoll = new PaperDollContainer(this, 164, 200, char.class)
    modalDoll.setScale(1.6).setDepth(76)
    modalDoll.setScrollFactor(0, true)
    for (const [slot, item] of Object.entries(eq)) {
      if (item) modalDoll.equip(slot as EquipmentSlot, item.template.name)
    }
    this.modalDolls.push(modalDoll)

    // Equipment slots grid: 2 cols × 3 rows
    EQ_GRID.forEach(([slotA, slotB], ri) => {
      ([slotA, slotB] as const).forEach((slot, ci) => {
        const x = 90 + ci * 145
        const y = 300 + ri * 64
        const item  = eq[slot as EquipmentSlot]
        const color = item ? RARITY_COLOR[item.template.rarity] ?? 0x888888 : 0x333344
        const box = this.add.rectangle(x, y, 132, 50, 0x111128).setStrokeStyle(1, color)
        modal.add(box)
        modal.add(this.add.text(x, y - 11, slot.toUpperCase(), this.font(5, '#555566')).setOrigin(0.5))
        modal.add(this.add.text(x, y + 7,
          item ? item.template.name : '—',
          this.font(7, item ? `#${color.toString(16).padStart(6,'0')}` : '#333344')).setOrigin(0.5))
        if (item) {
          box.setInteractive({ useHandCursor: true })
          box.on('pointerdown', async () => {
            box.disableInteractive()
            try {
              GameState.instance.character = await unequipItem(char.id, slot as EquipmentSlot)
              delete GameState.instance.equipped[slot as EquipmentSlot]
              await this.refreshCharModal()
            } catch {
              box.setInteractive({ useHandCursor: true })
            }
          })
        }
      })
    })

    // ── Right panel (x: 318–948, center 633) ────────────────────────────────

    type Tab = 'inventory' | 'skills'
    let activeTab: Tab = 'inventory'
    const tabObjs: Record<Tab, Phaser.GameObjects.GameObject[]> = { inventory: [], skills: [] }
    const tabBtns: Partial<Record<Tab, Phaser.GameObjects.Rectangle>> = {}

    const showTab = (tab: Tab) => {
      activeTab = tab
      this.charModalTab = tab
      for (const [t, objs] of Object.entries(tabObjs)) {
        const vis = t === tab
        objs.forEach(o => (o as unknown as { setVisible?(b: boolean): void }).setVisible?.(vis))
      }
      for (const [t, btn] of Object.entries(tabBtns)) {
        btn?.setFillStyle(t === tab ? 0x1a2035 : 0x111128)
      }
    }

    const tabDefs: { id: Tab; label: string; x: number; w: number }[] = [
      { id: 'inventory', label: 'INVENTORY', x: 453, w: 158 },
      { id: 'skills',    label: 'SKILLS',    x: 633, w: 120 },
    ]
    tabDefs.forEach(({ id, label, x, w }) => {
      const btn = this.add.rectangle(x, 42, w, 32, id === activeTab ? 0x1a2035 : 0x111128)
        .setStrokeStyle(1, 0x334466)
        .setInteractive({ useHandCursor: true })
      modal.add(btn)
      modal.add(this.add.text(x, 42, label, this.font(7, '#9aa8bd')).setOrigin(0.5))
      tabBtns[id] = btn
      btn.on('pointerdown', () => showTab(id))
    })

    // ── Inventory tab content ────────────────────────────────────────────────

    const buildInventory = () => {
      if (inventory.length === 0) {
        const e = this.add.text(633, 290, 'No items yet', this.font(10, '#333344')).setOrigin(0.5)
        tabObjs.inventory.push(e); modal.add(e)
        return
      }

      const COLS = 3, CW = 197, CH = 52, SX = 420, SY = 82, ROW_GAP = 58
      inventory.forEach((item: InventoryItem, idx) => {
        const col = idx % COLS
        const row = Math.floor(idx / COLS)
        const x   = SX + col * CW
        const y   = SY + row * ROW_GAP
        if (y + CH / 2 > 524) return

        const isEquipped = Object.values(eq).some(e => e?.id === item.id)
        const color = RARITY_COLOR[item.template.rarity] ?? 0x888888

        const box = this.add.rectangle(x, y, CW - 6, CH, isEquipped ? 0x0d1a0d : 0x111128)
          .setStrokeStyle(1, isEquipped ? 0x5ec05e : color)
          .setInteractive({ useHandCursor: true })
        const nameTxt = this.add.text(x, y - 11, item.template.name,
          this.font(7, `#${color.toString(16).padStart(6,'0')}`)).setOrigin(0.5)
        const bonuses = [
          item.template.attack_bonus  ? `+${item.template.attack_bonus}ATK`   : '',
          item.template.hp_bonus      ? `+${item.template.hp_bonus}HP`        : '',
          item.template.defense_bonus ? `+${item.template.defense_bonus}DEF`  : '',
          item.template.crit_bonus    ? `+${item.template.crit_bonus}%CR`     : '',
          item.template.cdr_bonus     ? `+${item.template.cdr_bonus}%CDR`     : '',
        ].filter(Boolean).join(' ')
        const statTxt = this.add.text(x, y + 8, bonuses, this.font(6, '#777788')).setOrigin(0.5)

        tabObjs.inventory.push(box, nameTxt, statTxt)
        modal.add(box); modal.add(nameTxt); modal.add(statTxt)

        box.on('pointerdown', async () => {
          box.disableInteractive()
          try {
            const slot = item.template.slot as EquipmentSlot
            if (isEquipped) {
              GameState.instance.character = await unequipItem(char.id, slot)
              delete GameState.instance.equipped[slot]
            } else {
              GameState.instance.character = await equipItem(char.id, slot, item.id)
              GameState.instance.equipped[slot] = item
            }
            await this.refreshCharModal()
          } catch {
            box.setInteractive({ useHandCursor: true })
          }
        })
      })
    }
    buildInventory()

    // ── Skills tab content ───────────────────────────────────────────────────

    const buildSkills = () => {
      const CX = 633, BY = 90, CW = 140, RH = 90

      const ptsLabel = this.add.text(CX, 65,
        `${skills.available_points} skill point(s) available`, this.font(7, '#9aa8bd')).setOrigin(0.5)
      tabObjs.skills.push(ptsLabel); modal.add(ptsLabel)

      const lineG = this.add.graphics()
      lineG.lineStyle(2, 0x334455, 1)
      skills.nodes.forEach(node => {
        if (!node.requires_id) return
        const parent = skills.nodes.find(n => n.id === node.requires_id)!
        lineG.strokeLineShape(new Phaser.Geom.Line(
          CX + parent.col * CW, BY + parent.row * RH,
          CX + node.col   * CW, BY + node.row   * RH,
        ))
      })
      tabObjs.skills.push(lineG); modal.add(lineG)

      skills.nodes.forEach(node => {
        const nx = CX + node.col * CW
        const ny = BY + node.row * RH
        const isUnlocked = skills.unlocked.includes(node.id)
        const isEquipped = skills.equipped_skill === node.id
        const prereqMet  = !node.requires_id || skills.unlocked.includes(node.requires_id)
        const canUnlock  = !isUnlocked && prereqMet && skills.available_points > 0

        const border = isEquipped ? 0xffd34d : isUnlocked ? 0x5ec05e : canUnlock ? 0x334466 : 0x222233
        const box = this.add.rectangle(nx, ny, 122, 46, isUnlocked ? 0x0d1a0d : 0x111128)
          .setStrokeStyle(2, border)
        const nameTxt = this.add.text(nx, ny - 8, node.name,
          this.font(8, isUnlocked ? '#88ff88' : canUnlock ? '#7788aa' : '#445566')).setOrigin(0.5)
        const typeTxt = this.add.text(nx, ny + 9,
          isEquipped ? 'EQUIPPED' : node.type.toUpperCase(),
          this.font(7, isEquipped ? '#ffd34d' : '#556677')).setOrigin(0.5)

        tabObjs.skills.push(box, nameTxt, typeTxt)
        modal.add(box); modal.add(nameTxt); modal.add(typeTxt)

        if (canUnlock || (isUnlocked && node.type === 'active' && !isEquipped)) {
          box.setInteractive({ useHandCursor: true })
          box.on('pointerdown', async () => {
            box.disableInteractive()
            try {
              if (canUnlock) {
                GameState.instance.skills = await unlockSkill(char.id, node.id)
              } else {
                GameState.instance.skills = await equipSkill(char.id, node.id)
              }
              await this.refreshCharModal()
            } catch {
              box.setInteractive({ useHandCursor: true })
            }
          })
        }
      })
    }
    buildSkills()

    // Restore last-active tab (persists across refresh after equip/unlock)
    showTab(this.charModalTab)

    // ── Close button ─────────────────────────────────────────────────────────
    const closeBtn = this.add.rectangle(938, 26, 38, 26, 0x1a0d0d)
      .setStrokeStyle(1, 0x664444)
      .setInteractive({ useHandCursor: true })
    modal.add(closeBtn)
    modal.add(this.add.text(938, 26, 'X', this.font(9, '#cc6666')).setOrigin(0.5))
    closeBtn.on('pointerdown', () => this.closeCharModal())
    pinToCamera(modal)
  }

  private closeCharModal(): void {
    for (const d of this.modalDolls) d.destroy()
    this.modalDolls = []
    this.activeModal?.destroy()
    this.activeModal = null
    this.dismissModal()
  }

  private async refreshCharModal(): Promise<void> {
    const char = GameState.instance.character!
    const [inventory, equipped, skills] = await Promise.all([
      getInventory(char.id),
      getEquipped(char.id),
      getSkills(char.id),
    ])
    if (!this.scene.isActive('Lobby')) return
    GameState.instance.inventory = inventory
    GameState.instance.equipped  = equipped
    GameState.instance.skills    = skills

    // Tear down old modal only after new data is ready — prevents flicker
    for (const d of this.modalDolls) d.destroy()
    this.modalDolls = []
    this.activeModal?.destroy()
    this.activeModal = null

    this.rebuildWidgetDoll()
    this.buildCharModalContent()
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.locked) return
      const p = _p as Phaser.Input.Pointer
      if (p.worldY < LOBBY_ARENA.y1 - 25) return
      this.moveTo = {
        x: Phaser.Math.Clamp(p.worldX, LOBBY_ARENA.x1, LOBBY_ARENA.x2),
        y: Phaser.Math.Clamp(p.worldY, LOBBY_ARENA.y1, LOBBY_ARENA.y2),
      }
      const r = this.add.circle(this.moveTo.x, this.moveTo.y, 4).setStrokeStyle(3, 0x5ec05e).setDepth(1)
      this.tweens.add({ targets:r, alpha:0, duration:350, ease:'Quad.out',
        onUpdate: () => r.setStrokeStyle(3, 0x5ec05e, Math.max(r.alpha, 0)),
        onComplete: () => r.destroy() })
    })
  }

  private setupPresence(): void {
    const char = GameState.instance.character
    if (!char) return

    this.presence = new PresenceSocket(
      char.id,
      (players) => this.onPresenceUpdate(players),
      (id) => this.onPresenceLeave(id),
    )
    this.presence.connect()
    this.presence.startBroadcast(() => ({
      x: this.hero.x,
      y: this.hero.y,
      moving: this.moveTo !== null,
      equipped: this.getOwnEquipped(),
      cls: char.class,
    }))
  }

  private getOwnEquipped(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const slot of VISUAL_SLOTS) {
      const item = GameState.instance.equipped[slot as EquipmentSlot]
      if (item) result[slot] = item.template.name
    }
    return result
  }

  private shutdownScene(): void {
    this.presence?.disconnect()
    this.presence = null
    if (this.lobbyPollInterval !== null) {
      clearInterval(this.lobbyPollInterval)
      this.lobbyPollInterval = null
    }
    for (const entry of this.otherPlayers.values()) {
      entry.doll.destroy()
      entry.label.destroy()
    }
    this.otherPlayers.clear()
    this.charWidgetDoll?.destroy()
    this.charWidgetDoll = null
    for (const d of this.modalDolls) d.destroy()
    this.modalDolls = []
  }

  private applyEquippedToDoll(doll: PaperDollContainer, equipped: Record<string, string>): void {
    for (const slot of VISUAL_SLOTS) {
      doll.unequip(slot)
    }
    for (const [slot, itemName] of Object.entries(equipped)) {
      doll.equip(slot as EquipmentSlot, itemName)
    }
  }

  private onPresenceUpdate(players: PlayerSnap[]): void {
    for (const player of players) {
      if (player.id === GameState.instance.character?.id) continue

      const entry = this.otherPlayers.get(player.id)
      if (!entry) {
        const doll = new PaperDollContainer(this, player.x, player.y, player.cls ?? 'Warrior')
        doll.setDepth(3).setTint(0x88aaff)
        if (player.equipped) this.applyEquippedToDoll(doll, player.equipped)
        const label = this.add.text(player.x, player.y - 40, player.name, {
          fontFamily: FONT,
          fontSize: '9px',
          color: '#88aaff',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(4)
        this.otherPlayers.set(player.id, { doll, label, targetX: player.x, targetY: player.y })
      } else {
        entry.targetX = player.x
        entry.targetY = player.y
        if (player.equipped) this.applyEquippedToDoll(entry.doll, player.equipped)
      }
    }
  }

  private onPresenceLeave(id: string): void {
    const entry = this.otherPlayers.get(id)
    if (!entry) return
    entry.doll.destroy()
    entry.label.destroy()
    this.otherPlayers.delete(id)
  }

  // ── Dungeon select dialog ─────────────────────────────────────────────────────

  private async openDungeonSelect(): Promise<void> {
    const char = GameState.instance.character
    if (!char) return

    const overlay = this.add.container(0, 0).setDepth(60).setScrollFactor(0)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85))
    overlay.add(this.add.text(W/2, 60, 'SELECT DUNGEON', this.font(14, '#c45aff')).setOrigin(0.5))
    overlay.add(this.add.text(W/2, 90, 'Choose your challenge', this.font(7, '#9aa8bd')).setOrigin(0.5))

    const loading = this.add.text(W/2, 200, 'Loading…', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(loading)

    const closeBtn = this.add.rectangle(W/2, H - 55, 160, 34, 0x2a2235)
      .setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    overlay.add(closeBtn)
    overlay.add(this.add.text(W/2, H - 55, 'CANCEL', this.font(9, '#888899')).setOrigin(0.5))
    closeBtn.on('pointerdown', () => { overlay.destroy(); this.dismissModal() })
    pinToCamera(overlay)

    try {
      const defs = await getDungeons()
      loading.destroy()
      buildDungeonList(this, overlay, defs, char.level, (d) => {
        overlay.destroy()
        this.scene.start('Dungeon', { dungeonId: d.id, dungeonName: d.name, minLevel: d.min_level })
      })
      pinToCamera(overlay)
    } catch {
      loading.setText('Could not load dungeons')
    }
  }

  // ── Raid dialog ──────────────────────────────────────────────────────────────

  private openRaidDialog(): void {
    const overlay = this.add.container(0, 0).setDepth(60).setScrollFactor(0)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.78))
    overlay.add(this.add.text(W/2, 110, 'RAID PORTAL', this.font(16, '#ff4d6d')).setOrigin(0.5))
    overlay.add(this.add.text(W/2, 148, 'The Forsaken Warlord', this.font(9, '#9aa8bd')).setOrigin(0.5))

    const makeBtn = (label: string, y: number, color: number) => {
      const bg = this.add.rectangle(W/2, y, 260, 44, 0x1a1a2e).setStrokeStyle(2, color).setInteractive({ useHandCursor: true })
      const txt = this.add.text(W/2, y, label, this.font(10, `#${color.toString(16).padStart(6,'0')}`)).setOrigin(0.5)
      overlay.add(bg); overlay.add(txt)
      return bg
    }

    makeBtn('SOLO RUN', 220, 0xff4d6d).on('pointerdown', () => {
      overlay.destroy()
      void this.startSoloRaid()
    })
    makeBtn('CREATE PARTY', 290, 0xffd34d).on('pointerdown', () => {
      overlay.destroy()
      void this.createPartyLobby()
    })
    makeBtn('JOIN PARTY', 360, 0x7fd4ff).on('pointerdown', () => {
      overlay.destroy()
      void this.joinPartyLobby()
    })

    const close = this.add.rectangle(W/2, 440, 140, 34, 0x2a2235).setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    const closeTxt = this.add.text(W/2, 440, 'CLOSE', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(close); overlay.add(closeTxt)
    close.on('pointerdown', () => {
      overlay.destroy()
      this.dismissModal()
    })
    pinToCamera(overlay)
  }

  private async startSoloRaid(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: char.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { run_id: string }
      this.scene.start('Raid', { runId: data.run_id })
    } catch {
      this.locked = false
    }
  }

  private async createPartyLobby(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-lobbies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: char.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { lobby_id: string; invite_code: string }
      this.showPartyLobby(data.lobby_id, data.invite_code, true)
    } catch {
      this.locked = false
    }
  }

  private async joinPartyLobby(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    const code = window.prompt('Enter invite code (e.g. ABCD-1234):')
    if (!code) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-lobbies/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: code.trim().toUpperCase(), character_id: char.id }),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        window.alert(err.error ?? 'Failed to join')
        this.locked = false
        return
      }
      const data = await res.json() as { lobby_id: string }
      this.showPartyLobby(data.lobby_id, code.trim().toUpperCase(), false)
    } catch {
      this.locked = false
    }
  }

  private showPartyLobby(lobbyId: string, inviteCode: string, isLeader: boolean): void {
    const char = GameState.instance.character!

    const overlay = this.add.container(0, 0).setDepth(60).setScrollFactor(0)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.82))
    overlay.add(this.add.text(W/2, 90, 'PARTY LOBBY', this.font(15, '#ffd34d')).setOrigin(0.5))

    if (isLeader) {
      overlay.add(this.add.text(W/2, 132, 'INVITE CODE', this.font(8, '#9aa8bd')).setOrigin(0.5))
      overlay.add(this.add.rectangle(W/2, 165, 260, 38, 0x1a1a2e).setStrokeStyle(2, 0xffd34d))
      overlay.add(this.add.text(W/2, 165, inviteCode, this.font(14, '#ffd34d')).setOrigin(0.5))
    } else {
      overlay.add(this.add.text(W/2, 132, 'Waiting for leader to start…', this.font(8, '#9aa8bd')).setOrigin(0.5))
    }

    overlay.add(this.add.text(W/2, 215, 'PARTY MEMBERS', this.font(8, '#888899')).setOrigin(0.5))
    const memberContainer = this.add.container(W/2, 240).setScrollFactor(0)
    overlay.add(memberContainer)

    const updateMembers = (members: LobbyMember[]) => {
      memberContainer.removeAll(true)
      members.forEach((m, i) => {
        const classColor = m.class === 'Warrior' ? '#ff9966' : m.class === 'Mage' ? '#7fd4ff' : '#88ff88'
        const txt = this.add.text(0, i * 26, `${m.name}  [${m.class}]${m.is_leader ? ' ★' : ''}`, this.font(8, classColor)).setOrigin(0.5)
        memberContainer.add(txt)
      })
    }

    if (isLeader) {
      const startBtn = this.add.rectangle(W/2, 390, 220, 42, 0x1f1a0e).setStrokeStyle(2, 0xffd34d).setInteractive({ useHandCursor: true })
      const startTxt = this.add.text(W/2, 390, 'START RAID', this.font(11, '#ffd34d')).setOrigin(0.5)
      overlay.add(startBtn); overlay.add(startTxt)
      startBtn.on('pointerdown', async () => {
        try {
          const res = await fetch(`${BASE}/raid-runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobby_id: lobbyId, character_id: char.id }),
          })
          if (!res.ok) throw new Error(await res.text())
          const data = await res.json() as { run_id: string }
          this.clearLobbyPoll()
          overlay.destroy()
          this.scene.start('Raid', { runId: data.run_id })
        } catch (e) {
          window.alert(`Could not start raid: ${String(e)}`)
        }
      })
    }

    const leaveY = isLeader ? 448 : 390
    const leaveBtn = this.add.rectangle(W/2, leaveY, 160, 34, 0x2a1a1e).setStrokeStyle(1, 0xff4d6d).setInteractive({ useHandCursor: true })
    overlay.add(leaveBtn)
    overlay.add(this.add.text(W/2, leaveY, 'LEAVE', this.font(9, '#ff4d6d')).setOrigin(0.5))
    leaveBtn.on('pointerdown', () => {
      this.clearLobbyPoll()
      overlay.destroy()
      this.dismissModal()
    })
    pinToCamera(overlay)

    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/raid-lobbies/${lobbyId}`)
        if (!res.ok) return
        const state = await res.json() as LobbyState
        updateMembers(state.members)
        if (!isLeader && state.status === 'started' && state.run_id) {
          this.clearLobbyPoll()
          overlay.destroy()
          this.scene.start('Raid', { runId: state.run_id })
        }
      } catch { /* ignore poll errors */ }
    }

    void poll()
    this.lobbyPollInterval = setInterval(() => { void poll() }, 2000)
  }

  private clearLobbyPoll(): void {
    if (this.lobbyPollInterval !== null) {
      clearInterval(this.lobbyPollInterval)
      this.lobbyPollInterval = null
    }
  }

  private dismissModal(): void {
    this.moveTo = null
    this.locked = false
    this.poiCooldownUntil = this.time.now + 1200
  }

  private resetHeroToCenter(): void {
    this.hero.x = 960
    this.hero.y = 560
    this.moveTo = null
    this.locked = false
  }

  // ── Update loop ────────────────────────────────────────────────────────────

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

    // Lerp other players toward their latest received position
    const lerpFactor = Math.min(1, delta * 0.012)
    for (const entry of this.otherPlayers.values()) {
      const nx = entry.doll.x + (entry.targetX - entry.doll.x) * lerpFactor
      const ny = entry.doll.y + (entry.targetY - entry.doll.y) * lerpFactor
      entry.doll.setPosition(nx, ny)
      entry.label.setPosition(nx, ny - 40)
    }

    if (!this.locked && this.time.now > this.poiCooldownUntil) {
      for (const poi of this.pois) {
        if (Phaser.Math.Distance.Between(h.x, h.y, poi.x, poi.y) < poi.r - 10) {
          this.locked = true
          poi.onEnter()
          break
        }
      }
    }
  }

  // ── Blacksmith ───────────────────────────────────────────────────────────

  private maxEnchantForRarity(rarity: string): number {
    switch (rarity) {
      case 'Uncommon': return 5
      case 'Rare':     return 8
      case 'Epic':     return 12
      default:         return 3
    }
  }

  private enchantCost(currentLevel: number): number {
    return 50 * Math.pow(3, currentLevel)
  }

  private primaryStatLabel(t: { attack_bonus: number; defense_bonus: number; hp_bonus: number; crit_bonus: number; cdr_bonus: number }): string {
    const vals: [number, string][] = [
      [t.attack_bonus,  'ATK'],
      [t.defense_bonus, 'DEF'],
      [t.hp_bonus,      'HP'],
      [t.crit_bonus,    'CRIT%'],
      [t.cdr_bonus,     'CDR%'],
    ]
    let best: [number, string] = [0, 'ATK']
    for (const v of vals) {
      if (v[0] > best[0]) best = v
    }
    return best[1]
  }

  private async openBlacksmith(): Promise<void> {
    const char = GameState.instance.character!

    // Refresh equipped data
    try {
      const equipped = await getEquipped(char.id)
      GameState.instance.equipped = equipped
    } catch {
      this.resetHeroToCenter()
      return
    }

    this.buildBlacksmithModal()
  }

  private buildBlacksmithModal(): void {
    const char = GameState.instance.character!
    const eq   = GameState.instance.equipped

    // Destroy any prior modal
    this.activeModal?.destroy()
    this.activeModal = null

    const overlay = this.add.container(0, 0).setDepth(70).setScrollFactor(0)
    this.activeModal = overlay

    // Backdrop
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setInteractive())

    // Panel
    overlay.add(this.add.rectangle(W/2, H/2, 760, 500, 0x0d0a1a).setStrokeStyle(2, 0xcc8844))

    // Title
    overlay.add(this.add.text(W/2, 40, 'BLACKSMITH', this.font(15, '#cc8844')).setOrigin(0.5))
    overlay.add(this.add.text(W/2, 68, 'Enchant your equipped gear', this.font(7, '#9aa8bd')).setOrigin(0.5))

    const goldTxt = this.add.text(W/2, 88, `Gold: ${char.gold}`, this.font(8, '#d4a020')).setOrigin(0.5)
    overlay.add(goldTxt)

    const equippedEntries = Object.entries(eq).filter(([, item]) => item != null) as [string, NonNullable<(typeof eq)[keyof typeof eq]>][]

    if (equippedEntries.length === 0) {
      overlay.add(this.add.text(W/2, H/2, 'No equipped items to enchant', this.font(9, '#555566')).setOrigin(0.5))
    } else {
      const COLS = 2, CW = 340, CH = 90, SX = W/2 - CW - 6, SY = 118, GAP = 98
      equippedEntries.forEach(([, item], idx) => {
        const col = idx % COLS
        const row = Math.floor(idx / COLS)
        const x   = SX + col * (CW + 12)
        const y   = SY + row * GAP

        if (y + CH / 2 > H - 60) return

        const enchantLevel = item.enchant_level ?? 0
        const maxLevel     = this.maxEnchantForRarity(item.template.rarity)
        const atMax        = enchantLevel >= maxLevel
        const cost         = this.enchantCost(enchantLevel)
        const canAfford    = char.gold >= cost
        const primaryStat  = this.primaryStatLabel(item.template)
        const rarityColor  = RARITY_COLOR[item.template.rarity] ?? 0x888888
        const colorHex     = `#${rarityColor.toString(16).padStart(6, '0')}`

        const box = this.add.rectangle(x + CW/2, y + CH/2, CW, CH, 0x111128)
          .setStrokeStyle(1, rarityColor)
        overlay.add(box)

        // Item name + enchant level
        const nameLabel = enchantLevel > 0 ? `${item.template.name}  +${enchantLevel}` : item.template.name
        overlay.add(this.add.text(x + 10, y + 8, nameLabel, this.font(8, colorHex)).setOrigin(0, 0.5))

        // Slot + rarity
        overlay.add(this.add.text(x + 10, y + 26, `${item.template.slot}  •  ${item.template.rarity}`, this.font(6, '#777788')).setOrigin(0, 0.5))

        if (atMax) {
          overlay.add(this.add.text(x + 10, y + 50, `MAX ENCHANT (+${maxLevel})`, this.font(7, '#cc8844')).setOrigin(0, 0.5))
        } else {
          // Next enchant info
          overlay.add(this.add.text(x + 10, y + 46,
            `Next: +${enchantLevel + 1} ${primaryStat}  •  Cost: ${cost}g`,
            this.font(6, canAfford ? '#88cc88' : '#774400')).setOrigin(0, 0.5))

          // Max info
          overlay.add(this.add.text(x + 10, y + 64,
            `Max: +${maxLevel}`,
            this.font(5, '#555566')).setOrigin(0, 0.5))

          // Enchant button
          const btnColor  = canAfford ? 0x1a2a1a : 0x1a1a1a
          const btnBorder = canAfford ? 0xcc8844 : 0x333333
          const btnTxtClr = canAfford ? '#cc8844' : '#444444'
          const enchBtn   = this.add.rectangle(x + CW - 52, y + CH/2, 88, 32, btnColor)
            .setStrokeStyle(1, btnBorder)
          overlay.add(enchBtn)
          const enchTxt = this.add.text(x + CW - 52, y + CH/2, 'ENCHANT', this.font(7, btnTxtClr)).setOrigin(0.5)
          overlay.add(enchTxt)

          if (canAfford) {
            enchBtn.setInteractive({ useHandCursor: true })
            enchBtn.on('pointerdown', async () => {
              enchBtn.disableInteractive()
              enchTxt.setColor('#888888')
              try {
                const res = await fetch(`${BASE}/enchant`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ equipment_id: item.id, character_id: char.id }),
                })
                if (!res.ok) {
                  const err = await res.json() as { error: string }
                  overlay.add(this.add.text(W/2, H - 52, err.error ?? 'Enchant failed', this.font(7, '#ff4444')).setOrigin(0.5))
                  enchBtn.setInteractive({ useHandCursor: true })
                  enchTxt.setColor(btnTxtClr)
                  return
                }
                const data = await res.json() as { gold: number; equipment: { id: string; enchant_level: number; template: ItemTemplate } }
                // Update gold
                char.gold = data.gold
                GameState.instance.character = { ...char }
                goldTxt.setText(`Gold: ${data.gold}`)
                // Update equipped item enchant level in GameState
                const slot = item.template.slot as EquipmentSlot
                const current = GameState.instance.equipped[slot]
                if (current) {
                  GameState.instance.equipped[slot] = { ...current, enchant_level: data.equipment.enchant_level }
                }
                // Rebuild modal to reflect changes
                overlay.destroy()
                this.activeModal = null
                this.buildBlacksmithModal()
              } catch {
                enchBtn.setInteractive({ useHandCursor: true })
                enchTxt.setColor(btnTxtClr)
              }
            })
          }
        }
      })
    }

    // Close button
    const closeBtn = this.add.rectangle(W/2 + 356, 40, 38, 28, 0x1a0d0d)
      .setStrokeStyle(1, 0x664444)
      .setInteractive({ useHandCursor: true })
    overlay.add(closeBtn)
    overlay.add(this.add.text(W/2 + 356, 40, 'X', this.font(9, '#cc6666')).setOrigin(0.5))
    closeBtn.on('pointerdown', () => {
      overlay.destroy()
      this.activeModal = null
      this.dismissModal()
    })
    pinToCamera(overlay)
  }

  // ── Shop ──────────────────────────────────────────────────────────────────

  private openShop(): void {
    const char = GameState.instance.character!
    const overlay = this.add.container(0, 0).setDepth(60).setScrollFactor(0)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setInteractive())

    overlay.add(this.add.text(W/2, 32, 'MERCHANT', this.font(16, '#ffd34d')).setOrigin(0.5))
    const goldTxt = this.add.text(W/2, 62, `Gold: ${char.gold}`, this.font(9, '#d4a020')).setOrigin(0.5)
    overlay.add(goldTxt)

    const loading = this.add.text(W/2, 280, 'Loading wares…', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(loading)

    const closeBtn = this.add.rectangle(W/2, H - 36, 160, 34, 0x2a2235).setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    const closeTxt = this.add.text(W/2, H - 36, 'CLOSE', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(closeBtn); overlay.add(closeTxt)
    closeBtn.on('pointerdown', () => { overlay.destroy(); this.dismissModal() })
    pinToCamera(overlay)

    void fetch(`${BASE}/shop?character_id=${char.id}`)
      .then(r => r.json())
      .then((items: Array<{
        id: string; name: string; slot: string; rarity: string; shop_price: number;
        attack_bonus: number; defense_bonus: number; hp_bonus: number;
        crit_bonus: number; cdr_bonus: number; class_restriction?: string | null
      }>) => {
        if (!overlay.active) return
        loading.destroy()

        const COLS = 3, CW = 270, CH = 72, SX = 195, SY = 92, GAP = 78
        items.forEach((item, idx) => {
          const col = idx % COLS
          const row = Math.floor(idx / COLS)
          const x = SX + col * CW
          const y = SY + row * GAP
          if (y + CH / 2 > H - 70) return

          const color = (RARITY_COLOR[item.rarity] ?? 0x888888)
          const colorHex = `#${color.toString(16).padStart(6, '0')}`

          const box = this.add.rectangle(x, y, CW - 8, CH, 0x0d0a1a).setStrokeStyle(1, color).setInteractive({ useHandCursor: true })
          overlay.add(box)
          overlay.add(this.add.text(x - CW/2 + 10, y - 22, item.name, this.font(8, colorHex)).setOrigin(0, 0.5))

          const bonuses = [
            item.attack_bonus  ? `+${item.attack_bonus}ATK`  : '',
            item.hp_bonus      ? `+${item.hp_bonus}HP`       : '',
            item.defense_bonus ? `+${item.defense_bonus}DEF` : '',
            item.crit_bonus    ? `+${item.crit_bonus}%CR`    : '',
            item.cdr_bonus     ? `+${item.cdr_bonus}%CDR`    : '',
          ].filter(Boolean).join('  ')
          overlay.add(this.add.text(x - CW/2 + 10, y - 4, bonuses, this.font(6, '#777788')).setOrigin(0, 0.5))

          const canAfford = char.gold >= item.shop_price
          const priceColor = canAfford ? '#ffd34d' : '#774400'
          overlay.add(this.add.text(x - CW/2 + 10, y + 16, `${item.shop_price} gold`, this.font(7, priceColor)).setOrigin(0, 0.5))

          const buyBtn = this.add.rectangle(x + CW/2 - 44, y, 72, 28, canAfford ? 0x1a2a1a : 0x1a1a1a)
            .setStrokeStyle(1, canAfford ? 0x5ec05e : 0x333333)
          overlay.add(buyBtn)
          overlay.add(this.add.text(x + CW/2 - 44, y, 'BUY', this.font(8, canAfford ? '#5ec05e' : '#444444')).setOrigin(0.5))

          if (canAfford) {
            buyBtn.setInteractive({ useHandCursor: true })
            buyBtn.on('pointerdown', async () => {
              buyBtn.disableInteractive()
              try {
                const res = await fetch(`${BASE}/shop/buy`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ character_id: char.id, item_template_id: item.id }),
                })
                if (!res.ok) {
                  const err = await res.json() as { error: string }
                  overlay.add(this.add.text(W/2, H - 65, err.error ?? 'Purchase failed', this.font(7, '#ff4444')).setOrigin(0.5))
                  buyBtn.setInteractive({ useHandCursor: true })
                  return
                }
                const updatedChar = await res.json() as typeof char
                GameState.instance.character = updatedChar
                char.gold = updatedChar.gold
                goldTxt.setText(`Gold: ${updatedChar.gold}`)
                box.setFillStyle(0x0a1a0a)
                box.setStrokeStyle(1, 0x5ec05e)
                buyBtn.disableInteractive()
                buyBtn.setFillStyle(0x112211)
                buyBtn.setStrokeStyle(1, 0x334433)
              } catch {
                buyBtn.setInteractive({ useHandCursor: true })
              }
            })
          }
        })

        if (items.length === 0) {
          overlay.add(this.add.text(W/2, 280, 'No items available for your class', this.font(9, '#555566')).setOrigin(0.5))
        }
        pinToCamera(overlay)
      })
      .catch(() => {
        if (overlay.active) loading.setText('Could not load shop')
      })
  }
}
