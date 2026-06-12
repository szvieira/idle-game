import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { getInventory, getEquipped, unequipItem } from '../api/items'
import type { InventoryItem, EquipmentSlot } from '../types/api'

const RARITY_COLOR: Record<string, number> = {
  Common:   0xb8c0cc,
  Uncommon: 0x5ec05e,
  Rare:     0x4da3ff,
  Epic:     0xc45aff,
}

const SLOTS: EquipmentSlot[] = ['Helmet','Armor','Weapon','Boots','Ring','Amulet']
const SLOT_POSITIONS: Record<EquipmentSlot, { x: number; y: number }> = {
  Helmet: { x: 400, y: 160 },
  Armor:  { x: 400, y: 260 },
  Weapon: { x: 260, y: 210 },
  Boots:  { x: 400, y: 360 },
  Ring:   { x: 540, y: 160 },
  Amulet: { x: 540, y: 260 },
}

export class CharacterSheetScene extends Phaser.Scene {
  private doll!: PaperDollContainer

  constructor() {
    super({ key: 'CharacterSheet' })
  }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.add.rectangle(400, 300, 800, 600, 0x111122)
    this.add.text(400, 20, 'CHARACTER SHEET', {
      font: '18px monospace', color: '#ffffff',
    }).setOrigin(0.5)

    // Paper doll center
    this.doll = new PaperDollContainer(this, 400, 280)
    this.doll.setDepth(5)

    // Stat block
    const leftX = 40
    const stats = [
      `Name:     ${char.name}`,
      `Class:    ${char.class}`,
      `Level:    ${char.level}`,
      `XP:       ${char.xp} / ${char.xp_to_next}`,
      `Gold:     ${char.gold}`,
      ``,
      `HP:       ${char.hp} / ${char.max_hp}`,
      `Attack:   ${char.attack}`,
      `Defense:  ${char.defense}`,
      `Crit:     ${char.critical}%`,
      `CDR:      ${char.cdr}%`,
    ]
    stats.forEach((line, i) => {
      this.add.text(leftX, 60 + i * 26, line, {
        font: '13px monospace', color: '#cccccc',
      })
    })

    // Load and render equipped items
    try {
      const [inventory, equipped] = await Promise.all([
        getInventory(char.id),
        getEquipped(char.id),
      ])
      GameState.instance.inventory = inventory
      GameState.instance.equipped  = equipped

      // Apply to doll
      for (const slot of SLOTS) {
        const item = equipped[slot]
        if (item) this.doll.equip(slot, item.template.name)
      }

      this.buildSlotBoxes(equipped)
    } catch (e) {
      this.add.text(400, 500, 'Error loading inventory', {
        font: '13px monospace', color: '#ff4444',
      }).setOrigin(0.5)
    }

    // Back button
    const backBtn = this.add.rectangle(400, 560, 140, 36, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(400, 560, 'Back', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    backBtn.on('pointerover', () => backBtn.setFillStyle(0x445566))
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x334455))
    backBtn.on('pointerdown', () => this.scene.start('Hub'))
  }

  private buildSlotBoxes(equipped: Record<string, InventoryItem | undefined>): void {
    const char = GameState.instance.character!
    for (const slot of SLOTS) {
      const pos  = SLOT_POSITIONS[slot]
      const item = equipped[slot]

      const box = this.add.rectangle(pos.x, pos.y, 140, 50, 0x222233)
        .setStrokeStyle(1, item ? RARITY_COLOR[item.template.rarity] : 0x444444)
        .setInteractive({ useHandCursor: true })

      this.add.text(pos.x, pos.y - 10, slot, {
        font: '10px monospace', color: '#888888',
      }).setOrigin(0.5)

      const nameText = this.add.text(pos.x, pos.y + 8,
        item ? item.template.name : '—', {
          font: '11px monospace',
          color: item ? `#${RARITY_COLOR[item.template.rarity].toString(16).padStart(6,'0')}` : '#555555',
        }).setOrigin(0.5)

      if (item) {
        box.on('pointerdown', async () => {
          box.disableInteractive()
          try {
            const updated = await unequipItem(char.id, slot)
            GameState.instance.character = updated
            this.doll.unequip(slot)
            nameText.setText('—').setColor('#555555')
            box.setStrokeStyle(1, 0x444444)
            delete GameState.instance.equipped[slot]
          } finally {
            box.setInteractive({ useHandCursor: true })
          }
        })
      }
    }
  }
}
