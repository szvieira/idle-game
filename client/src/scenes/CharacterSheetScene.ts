import Phaser from 'phaser'
import { GameState } from '../state/GameState'

export class CharacterSheetScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharacterSheet' })
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) {
      this.scene.start('CharacterSelect')
      return
    }

    const { width } = this.scale

    this.add.text(width / 2, 24, 'Character Sheet', {
      font: '22px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    const leftCol = 60
    const rightCol = width / 2 + 20
    const startY = 70
    const lineH = 28

    const leftStats = [
      `Name:     ${char.name}`,
      `Class:    ${char.class}`,
      `Level:    ${char.level}`,
      `XP:       ${char.xp} / ${char.xp_to_next}`,
      `Gold:     ${char.gold}`,
    ]

    const rightStats = [
      `HP:       ${char.hp} / ${char.max_hp}`,
      `Mana:     ${char.mana} / ${char.max_mana}`,
      `Attack:   ${char.attack}`,
      `Defense:  ${char.defense}`,
      `Critical: ${char.critical}`,
      `CDR:      ${char.cdr}`,
    ]

    leftStats.forEach((line, i) => {
      this.add.text(leftCol, startY + i * lineH, line, { font: '16px monospace', color: '#cccccc' })
    })

    rightStats.forEach((line, i) => {
      this.add.text(rightCol, startY + i * lineH, line, { font: '16px monospace', color: '#cccccc' })
    })

    // Equipment slots
    const slots = [
      { label: 'Helmet', x: 160 },
      { label: 'Armor',  x: 400 },
      { label: 'Weapon', x: 640 },
    ]
    const slotY = 350

    slots.forEach(({ label, x }) => {
      this.add.rectangle(x, slotY, 160, 60, 0x222222).setStrokeStyle(1, 0x444444)
      this.add.text(x, slotY - 14, label, { font: '14px monospace', color: '#888888' }).setOrigin(0.5)
      this.add.text(x, slotY + 6,  'Empty', { font: '14px monospace', color: '#555555' }).setOrigin(0.5)
    })

    // Back button
    const backBtn = this.add.rectangle(width / 2, 450, 140, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(width / 2, 450, 'Back', { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    backBtn.on('pointerover', () => backBtn.setFillStyle(0x445566))
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x334455))
    backBtn.on('pointerdown', () => this.scene.start('Hub'))
  }
}
