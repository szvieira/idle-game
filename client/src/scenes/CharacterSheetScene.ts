import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { getInventory, getEquipped, equipItem, unequipItem } from '../api/items'
import { getSkills, unlockSkill, equipSkill } from '../api/skills'
import type { InventoryItem, EquipmentSlot } from '../types/api'

const RARITY_COLOR: Record<string, number> = {
  Common: 0xb8c0cc, Uncommon: 0x5ec05e, Rare: 0x4da3ff, Epic: 0xc45aff,
}

type Tab = 'stats' | 'inventory' | 'skills'

interface NodeLayout {
  id: string
  name: string
  type: 'active' | 'passive'
  requiresId: string | null
  col: number
  row: number
}

const SKILL_TREE_LAYOUT: NodeLayout[] = [
  { id:'whirlwind',   name:'Whirlwind',   type:'active',  requiresId: null,          col: 0,  row: 0 },
  { id:'brute_force', name:'Brute Force', type:'passive', requiresId:'whirlwind',    col:-1,  row: 1 },
  { id:'fury',        name:'Fury',        type:'passive', requiresId:'brute_force',  col:-1,  row: 2 },
  { id:'charge',      name:'Charge',      type:'active',  requiresId:'fury',         col:-1,  row: 3 },
  { id:'iron_skin',   name:'Iron Skin',   type:'passive', requiresId:'whirlwind',    col: 1,  row: 1 },
  { id:'vigor',       name:'Vigor',       type:'passive', requiresId:'iron_skin',    col: 1,  row: 2 },
]

const SLOTS: EquipmentSlot[] = ['Helmet','Armor','Weapon','Boots','Ring','Amulet']
const SLOT_POS: Record<EquipmentSlot, { x: number; y: number }> = {
  Helmet: { x:400, y:160 }, Armor:  { x:400, y:260 }, Weapon: { x:260, y:210 },
  Boots:  { x:400, y:360 }, Ring:   { x:540, y:160 }, Amulet: { x:540, y:260 },
}

export class CharacterSheetScene extends Phaser.Scene {
  private doll!: PaperDollContainer
  private tabContents: Map<Tab, Phaser.GameObjects.GameObject[]> = new Map()
  private activeTab: Tab = 'stats'

  constructor() { super({ key: 'CharacterSheet' }) }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.tabContents = new Map()
    this.add.rectangle(400, 300, 800, 600, 0x0d0d1a)

    // Tab buttons
    const tabs: Tab[] = ['stats', 'inventory', 'skills']
    const tabBtns = tabs.map((tab, i) => {
      const x = 160 + i * 180
      const btn = this.add.rectangle(x, 40, 160, 36, this.activeTab === tab ? 0x334466 : 0x222233)
        .setStrokeStyle(1, 0x445577).setInteractive({ useHandCursor: true })
      this.add.text(x, 40, tab.toUpperCase(), { font: '12px monospace', color: '#aaaacc' }).setOrigin(0.5)
      btn.on('pointerdown', () => this.switchTab(tab, tabBtns, tabs))
      return btn
    })

    // Back button
    const backBtn = this.add.rectangle(700, 40, 120, 36, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(700, 40, 'BACK', { font: '12px monospace', color: '#ffffff' }).setOrigin(0.5)
    backBtn.on('pointerdown', () => this.scene.start('Lobby'))

    // Load data
    try {
      const [inventory, equipped, skills] = await Promise.all([
        getInventory(char.id),
        getEquipped(char.id),
        getSkills(char.id),
      ])
      GameState.instance.inventory = inventory
      GameState.instance.equipped  = equipped
      GameState.instance.skills    = skills
    } catch {
      this.add.text(400, 300, 'Error loading data', {
        font: '14px monospace', color: '#ff4444',
      }).setOrigin(0.5)
      return
    }

    this.buildStatsTab()
    this.buildInventoryTab()
    this.buildSkillsTab()
    this.showTab(this.activeTab)
  }

  private switchTab(tab: Tab, btns: Phaser.GameObjects.Rectangle[], tabs: Tab[]): void {
    tabs.forEach((t, i) => btns[i].setFillStyle(t === tab ? 0x334466 : 0x222233))
    this.showTab(tab)
  }

  private showTab(tab: Tab): void {
    for (const [t, objs] of this.tabContents) {
      objs.forEach(o => {
        const vis = o as unknown as { setVisible?: (v: boolean) => void }
        vis.setVisible?.(t === tab)
      })
    }
    this.activeTab = tab
  }

  // ── Stats tab ──────────────────────────────────────────────────────────────
  private buildStatsTab(): void {
    const char = GameState.instance.character!
    const eq   = GameState.instance.equipped
    const objs: Phaser.GameObjects.GameObject[] = []

    this.doll = new PaperDollContainer(this, 400, 280)
    objs.push(this.doll as unknown as Phaser.GameObjects.GameObject)

    // Apply overlays
    for (const slot of SLOTS) {
      const item = eq[slot]
      if (item) this.doll.equip(slot, item.template.name)
    }

    // Stat block
    const statLines = [
      `${char.name}  Lv.${char.level}  ${char.class}`,
      `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`,
      `ATK: ${char.attack}   DEF: ${char.defense}`,
      `CRIT: ${char.critical}%   CDR: ${char.cdr}%`,
    ]
    statLines.forEach((line, i) => {
      objs.push(this.add.text(20, 80 + i * 28, line, {
        font: '13px monospace', color: '#cccccc',
      }))
    })

    // Slot boxes
    for (const slot of SLOTS) {
      const pos  = SLOT_POS[slot]
      const item = eq[slot]
      const color = item ? RARITY_COLOR[item.template.rarity] : 0x444444
      const box = this.add.rectangle(pos.x, pos.y, 140, 46, 0x1a1a2e)
        .setStrokeStyle(1, color)
      objs.push(box)
      objs.push(this.add.text(pos.x, pos.y - 8, slot,
        { font: '9px monospace', color: '#666688' }).setOrigin(0.5))
      objs.push(this.add.text(pos.x, pos.y + 9,
        item ? item.template.name : '—',
        { font: '10px monospace',
          color: item ? `#${color.toString(16).padStart(6,'0')}` : '#444466',
        }).setOrigin(0.5))
    }

    this.tabContents.set('stats', objs)
  }

  // ── Inventory tab ──────────────────────────────────────────────────────────
  private buildInventoryTab(): void {
    const char      = GameState.instance.character!
    const inventory = GameState.instance.inventory
    const objs: Phaser.GameObjects.GameObject[] = []

    objs.push(this.add.text(400, 75, 'INVENTORY', {
      font: '14px monospace', color: '#aaaacc',
    }).setOrigin(0.5))

    if (inventory.length === 0) {
      objs.push(this.add.text(400, 300, 'No items', {
        font: '13px monospace', color: '#555566',
      }).setOrigin(0.5))
    }

    const COLS = 4, CELL_W = 180, CELL_H = 56, START_X = 100, START_Y = 110
    inventory.forEach((item: InventoryItem, idx: number) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const x   = START_X + col * CELL_W
      const y   = START_Y + row * CELL_H
      const color = RARITY_COLOR[item.template.rarity]
      const equipped = Object.values(GameState.instance.equipped)
        .some(e => e?.id === item.id)

      const box = this.add.rectangle(x, y, CELL_W - 8, CELL_H - 6,
        equipped ? 0x1a2a1a : 0x1a1a2e)
        .setStrokeStyle(1, equipped ? 0x5ec05e : color)
        .setInteractive({ useHandCursor: true })
      objs.push(box)

      objs.push(this.add.text(x, y - 10, item.template.name,
        { font: '10px monospace',
          color: `#${color.toString(16).padStart(6,'0')}` }).setOrigin(0.5))

      const statsStr = [
        item.template.attack_bonus  ? `+${item.template.attack_bonus} ATK`  : '',
        item.template.hp_bonus      ? `+${item.template.hp_bonus} HP`       : '',
        item.template.defense_bonus ? `+${item.template.defense_bonus} DEF` : '',
        item.template.crit_bonus    ? `+${item.template.crit_bonus}% CRIT`  : '',
        item.template.cdr_bonus     ? `+${item.template.cdr_bonus}% CDR`    : '',
      ].filter(Boolean).join(' ')
      objs.push(this.add.text(x, y + 8, statsStr,
        { font: '9px monospace', color: '#888899' }).setOrigin(0.5))

      box.on('pointerdown', async () => {
        box.disableInteractive()
        try {
          const slot = item.template.slot as EquipmentSlot
          if (equipped) {
            const updated = await unequipItem(char.id, slot)
            GameState.instance.character = updated
            delete GameState.instance.equipped[slot]
          } else {
            const updated = await equipItem(char.id, slot, item.id)
            GameState.instance.character = updated
            GameState.instance.equipped[slot] = item
          }
          // Refresh scene
          this.scene.restart()
        } catch {
          box.setInteractive({ useHandCursor: true })
        }
      })
    })

    this.tabContents.set('inventory', objs)
  }

  // ── Skills tab ─────────────────────────────────────────────────────────────
  private buildSkillsTab(): void {
    const skills = GameState.instance.skills
    const char   = GameState.instance.character!
    const objs: Phaser.GameObjects.GameObject[] = []

    const CENTER_X = 400, BASE_Y = 120, COL_W = 160, ROW_H = 100

    objs.push(this.add.text(CENTER_X, 75,
      `SKILL TREE   —   ${skills.available_points} point(s) available`,
      { font: '12px monospace', color: '#aaaacc' }).setOrigin(0.5))

    // Draw connector lines first
    const g = this.add.graphics()
    objs.push(g)
    g.lineStyle(2, 0x334455, 1)
    SKILL_TREE_LAYOUT.forEach(node => {
      if (!node.requiresId) return
      const parent = SKILL_TREE_LAYOUT.find(n => n.id === node.requiresId)!
      const px = CENTER_X + parent.col * COL_W
      const py = BASE_Y   + parent.row * ROW_H
      const nx = CENTER_X + node.col   * COL_W
      const ny = BASE_Y   + node.row   * ROW_H
      g.strokeLineShape(new Phaser.Geom.Line(px, py, nx, ny))
    })

    // Draw nodes
    SKILL_TREE_LAYOUT.forEach(node => {
      const nx = CENTER_X + node.col * COL_W
      const ny = BASE_Y   + node.row * ROW_H
      const isUnlocked = skills.unlocked.includes(node.id)
      const isEquipped = skills.equipped_skill === node.id
      const prereqMet  = !node.requiresId || skills.unlocked.includes(node.requiresId)
      const canUnlock  = !isUnlocked && prereqMet && skills.available_points > 0

      const fillColor = isUnlocked ? 0x1a2a1a : 0x1a1a2e
      const borderColor = isEquipped ? 0xffd34d
                        : isUnlocked ? 0x5ec05e
                        : canUnlock  ? 0x334466
                        : 0x2a2a3a

      const box = this.add.rectangle(nx, ny, 120, 46, fillColor)
        .setStrokeStyle(2, borderColor)

      objs.push(box)
      objs.push(this.add.text(nx, ny - 8, node.name,
        { font: '10px monospace',
          color: isUnlocked ? '#88ff88' : canUnlock ? '#7788aa' : '#445566',
        }).setOrigin(0.5))
      objs.push(this.add.text(nx, ny + 9,
        isEquipped ? 'EQUIPPED' : node.type.toUpperCase(),
        { font: '8px monospace',
          color: isEquipped ? '#ffd34d' : '#556677',
        }).setOrigin(0.5))

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
            this.scene.restart()
          } catch {
            box.setInteractive({ useHandCursor: true })
          }
        })
      }
    })

    this.tabContents.set('skills', objs)
  }
}
