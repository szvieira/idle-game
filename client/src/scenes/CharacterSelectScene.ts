import Phaser from 'phaser'
import { getCharacters } from '../api/characters'
import { GameState } from '../state/GameState'

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharacterSelect' })
  }

  async create(): Promise<void> {
    try {
      const characters = await getCharacters()
      this.render(characters)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, { font: '16px monospace', color: '#ff4444' })
    }
  }

  private render(characters: Awaited<ReturnType<typeof getCharacters>>): void {
    const { width } = this.scale

    this.add.text(width / 2, 30, 'Select Your Character', {
      font: '24px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    const cardW = 500
    const cardH = 80
    const cardX = width / 2
    const startY = 100

    characters.forEach((char, i) => {
      const y = startY + i * (cardH + 10)
      const bg = this.add.rectangle(cardX, y + cardH / 2, cardW, cardH, 0x222222)
        .setStrokeStyle(1, 0x444444)
        .setInteractive({ useHandCursor: true })

      this.add.text(cardX - 230, y + 10, char.name, { font: '18px monospace', color: '#ffffff' })
      this.add.text(cardX - 230, y + 34, `${char.class}  Lv.${char.level}`, { font: '14px monospace', color: '#aaaaaa' })
      this.add.text(cardX + 80, y + 10, `HP: ${char.hp}/${char.max_hp}`, { font: '14px monospace', color: '#aaaaaa' })
      this.add.text(cardX + 80, y + 34, `Gold: ${char.gold}`, { font: '14px monospace', color: '#aaaaaa' })

      bg.on('pointerover', () => bg.setFillStyle(0x333333))
      bg.on('pointerout', () => bg.setFillStyle(0x222222))
      bg.on('pointerdown', () => {
        GameState.instance.character = char
        this.scene.start('Hub')
      })
    })

    const createY = startY + characters.length * (cardH + 10) + 20
    const createBtn = this.add.rectangle(cardX, createY + 20, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(cardX, createY + 20, 'Create New', { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    createBtn.on('pointerover', () => createBtn.setFillStyle(0x445566))
    createBtn.on('pointerout', () => createBtn.setFillStyle(0x334455))
    createBtn.on('pointerdown', () => this.scene.start('CharacterCreate'))
  }
}
