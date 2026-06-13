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
import type { EquipmentSlot, InventoryItem } from '../types/api'
import type { PlayerSnap } from '../net/PresenceSocket'

const WORLD_W = 1920
const WORLD_H = 800
const LOBBY_ARENA = { x1: 80, y1: 380, x2: 1840, y2: 760 }
const BASE = 'http://localhost:8080'

const RARITY_COLOR: Record<string, number> = {
  Common: 0xb8c0cc, Uncommon: 0x5ec05e, Rare: 0x4da3ff, Epic: 0xc45aff,
}

// Equipment slot grid: 2 columns × 3 rows in the modal left panel
const EQ_GRID = [
  ['Helmet', 'Ring'],
  ['Weapon', 'Amulet'],
  ['Armor',  'Boots'],
] as const

const SKILL_NODES = [
  { id: 'whirlwind',   name: 'Whirlwind',   type: 'active'  as const, req: null,           col: 0,  row: 0 },
  { id: 'brute_force', name: 'Brute Force', type: 'passive' as const, req: 'whirlwind',    col: -1, row: 1 },
  { id: 'fury',        name: 'Fury',        type: 'passive' as const, req: 'brute_force',  col: -1, row: 2 },
  { id: 'charge',      name: 'Charge',      type: 'active'  as const, req: 'fury',         col: -1, row: 3 },
  { id: 'iron_skin',   name: 'Iron Skin',   type: 'passive' as const, req: 'whirlwind',    col:  1, row: 1 },
  { id: 'vigor',       name: 'Vigor',       type: 'passive' as const, req: 'iron_skin',    col:  1, row: 2 },
]

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
  private presence: PresenceSocket | null = null
  private otherPlayers: Map<string, OtherPlayer> = new Map()
  private lobbyPollInterval: ReturnType<typeof setInterval> | null = null

  // Character modal state
  private charWidgetDoll: PaperDollContainer | null = null
  private modalDolls: PaperDollContainer[] = []
  private activeModal: Phaser.GameObjects.Container | null = null
  private modalFromPoi = false

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
    this.add.rectangle(W/2, H/2, W, H, 0x151a26).setDepth(-10)
    const g = this.add.graphics().setDepth(-6)
    g.fillStyle(0xe8e2d0, 0.8)
    for (let i = 0; i < 40; i++)
      g.fillRect(Phaser.Math.Between(0,W), Phaser.Math.Between(0,190), 2, 2)
    g.fillStyle(0x1c2435, 1)
    g.fillTriangle(60,335,260,150,460,335)
    g.fillTriangle(380,335,600,110,860,335)
    g.fillStyle(0x232c40, 1)
    g.fillTriangle(-40,335,140,200,340,335)
    g.fillTriangle(620,335,800,190,1020,335)
    g.fillStyle(0x1b1622, 1); g.fillRect(0,335,W,H-335)
    g.fillStyle(0x232c40, 0.4)
    for (let ty=344; ty<H; ty+=44)
      for (let tx=(ty%88===0?0:44); tx<W; tx+=88)
        g.fillRect(tx,ty,42,42)
    g.fillStyle(0x2a2235,1); g.fillRect(0,335,W,8)
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

  private buildPOIs(): void {
    this.addPOI({ x:854, y:390, r:55, color:0x5ec05e, label:'EXPEDITION',
      onEnter: () => this.scene.start('Expedition') })

    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x2a2235, 1); g.fillRect(78,244,110,98)
    g.fillStyle(0x0b0a12, 1); g.fillRect(103,270,60,72)
    g.fillStyle(0x3a2a4a, 1); g.fillTriangle(78,244,133,208,188,244)
    this.addPOI({ x:133, y:390, r:55, color:0xc45aff, label:'DUNGEON',
      onEnter: () => void this.openDungeonSelect() })

    this.addPOI({ x:640, y:416, r:50, color:0xffd34d, label:'SHOP',
      onEnter: () => this.openShop() })

    this.addPOI({ x:382, y:390, r:50, color:0x9aa8bd, label:'CHARACTER',
      onEnter: () => { this.modalFromPoi = true; void this.openCharModal() } })

    this.addPOI({ x:510, y:365, r:45, color:0xff4d6d, label:'RAID',
      onEnter: () => this.openRaidDialog() })
  }

  private buildTopUI(): void {
    const char = GameState.instance.character!
    this.add.text(20, 14, `${char.name}  Lv.${char.level}  ${char.class}`, this.font(11)).setDepth(20)
    this.add.text(20, 34, `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`, this.font(9,'#aaaacc')).setDepth(20)
  }

  // ── Character widget (top-right) ──────────────────────────────────────────

  private buildCharWidget(): void {
    const char = GameState.instance.character!

    // Interactive background card
    const bg = this.add.rectangle(838, 30, 230, 46, 0x0d0a1a, 0.92)
      .setStrokeStyle(1, 0x334466)
      .setInteractive({ useHandCursor: true })
      .setDepth(22)

    this.charWidgetDoll = this.makeWidgetDoll()

    this.add.text(793, 19, char.name, this.font(7)).setOrigin(0, 0.5).setDepth(24)
    this.add.text(793, 37, `Lv.${char.level}  ${char.class}`, this.font(7, '#9aa8bd')).setOrigin(0, 0.5).setDepth(24)

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

    const modal = this.add.container(0, 0).setDepth(70)
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
        const color = item ? RARITY_COLOR[item.template.rarity] : 0x333344
        modal.add(this.add.rectangle(x, y, 132, 50, 0x111128).setStrokeStyle(1, color))
        modal.add(this.add.text(x, y - 11, slot.toUpperCase(), this.font(5, '#555566')).setOrigin(0.5))
        modal.add(this.add.text(x, y + 7,
          item ? item.template.name : '—',
          this.font(7, item ? `#${color.toString(16).padStart(6,'0')}` : '#333344')).setOrigin(0.5))
      })
    })

    // ── Right panel (x: 318–948, center 633) ────────────────────────────────

    type Tab = 'inventory' | 'skills'
    let activeTab: Tab = 'inventory'
    const tabObjs: Record<Tab, Phaser.GameObjects.GameObject[]> = { inventory: [], skills: [] }
    const tabBtns: Partial<Record<Tab, Phaser.GameObjects.Rectangle>> = {}

    const showTab = (tab: Tab) => {
      activeTab = tab
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
        const color = RARITY_COLOR[item.template.rarity]

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
      SKILL_NODES.forEach(node => {
        if (!node.req) return
        const parent = SKILL_NODES.find(n => n.id === node.req)!
        lineG.strokeLineShape(new Phaser.Geom.Line(
          CX + parent.col * CW, BY + parent.row * RH,
          CX + node.col   * CW, BY + node.row   * RH,
        ))
      })
      tabObjs.skills.push(lineG); modal.add(lineG)

      SKILL_NODES.forEach(node => {
        const nx = CX + node.col * CW
        const ny = BY + node.row * RH
        const isUnlocked = skills.unlocked.includes(node.id)
        const isEquipped = skills.equipped_skill === node.id
        const prereqMet  = !node.req || skills.unlocked.includes(node.req)
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

    // Default to inventory tab
    showTab('inventory')

    // ── Close button ─────────────────────────────────────────────────────────
    const closeBtn = this.add.rectangle(938, 26, 38, 26, 0x1a0d0d)
      .setStrokeStyle(1, 0x664444)
      .setInteractive({ useHandCursor: true })
    modal.add(closeBtn)
    modal.add(this.add.text(938, 26, 'X', this.font(9, '#cc6666')).setOrigin(0.5))
    closeBtn.on('pointerdown', () => this.closeCharModal())
  }

  private closeCharModal(): void {
    for (const d of this.modalDolls) d.destroy()
    this.modalDolls = []
    this.activeModal?.destroy()
    this.activeModal = null
    if (this.modalFromPoi) {
      this.resetHeroToCenter()
    } else {
      this.locked = false
    }
  }

  private async refreshCharModal(): Promise<void> {
    // Tear down without resetting movement lock
    for (const d of this.modalDolls) d.destroy()
    this.modalDolls = []
    this.activeModal?.destroy()
    this.activeModal = null

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

    const overlay = this.add.container(0, 0).setDepth(60)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85))
    overlay.add(this.add.text(W/2, 60, 'SELECT DUNGEON', this.font(14, '#c45aff')).setOrigin(0.5))
    overlay.add(this.add.text(W/2, 90, 'Choose your challenge', this.font(7, '#9aa8bd')).setOrigin(0.5))

    const loading = this.add.text(W/2, 200, 'Loading…', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(loading)

    const closeBtn = this.add.rectangle(W/2, H - 55, 160, 34, 0x2a2235)
      .setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    overlay.add(closeBtn)
    overlay.add(this.add.text(W/2, H - 55, 'CANCEL', this.font(9, '#888899')).setOrigin(0.5))
    closeBtn.on('pointerdown', () => { overlay.destroy(); this.resetHeroToCenter() })

    try {
      const defs = await getDungeons()
      loading.destroy()
      buildDungeonList(this, overlay, defs, char.level, (d) => {
        overlay.destroy()
        this.scene.start('Dungeon', { dungeonId: d.id, dungeonName: d.name, minLevel: d.min_level })
      })
    } catch {
      loading.setText('Could not load dungeons')
    }
  }

  // ── Raid dialog ──────────────────────────────────────────────────────────────

  private openRaidDialog(): void {
    const overlay = this.add.container(0, 0).setDepth(60)
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
      this.resetHeroToCenter()
    })
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

    const overlay = this.add.container(0, 0).setDepth(60)
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
    const memberContainer = this.add.container(W/2, 240)
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
      this.resetHeroToCenter()
    })

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

  private resetHeroToCenter(): void {
    this.hero.x = W/2
    this.hero.y = 472
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

    if (!this.locked) {
      for (const poi of this.pois) {
        if (Phaser.Math.Distance.Between(h.x, h.y, poi.x, poi.y) < poi.r - 10) {
          this.locked = true
          poi.onEnter()
          break
        }
      }
    }
  }

  // ── Shop (unchanged) ───────────────────────────────────────────────────────

  private openShop(): void {
    const char = GameState.instance.character!
    const overlay = this.add.container(0,0).setDepth(60)
    overlay.add(this.add.rectangle(W/2,H/2,W,H, 0x000000, 0.75))
    overlay.add(this.add.text(W/2, 160, 'SHOP', this.font(18,'#ffd34d')).setOrigin(0.5))
    const hp = this.add.rectangle(W/2-80, 280, 200, 50, 0x1a2a1a).setStrokeStyle(1, 0x5ec05e).setInteractive({ useHandCursor:true })
    overlay.add(hp)
    overlay.add(this.add.text(W/2-80, 272, 'HP Potion', this.font(11,'#5ec05e')).setOrigin(0.5))
    overlay.add(this.add.text(W/2-80, 290, '50 Gold — +50% HP', this.font(8,'#888899')).setOrigin(0.5))
    hp.on('pointerdown', () => {
      if (char.gold < 50) return
      char.gold -= 50
      char.hp = Math.min(char.max_hp, char.hp + Math.round(char.max_hp * 0.5))
    })
    const close = this.add.rectangle(W/2, 420, 120, 36, 0x334455).setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor:true })
    overlay.add(close)
    overlay.add(this.add.text(W/2, 420, 'CLOSE', this.font(10)).setOrigin(0.5))
    close.on('pointerdown', () => {
      overlay.destroy()
      this.resetHeroToCenter()
    })
  }
}
