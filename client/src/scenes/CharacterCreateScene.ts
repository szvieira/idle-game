import Phaser from 'phaser'
import { createCharacter } from '../api/characters'
import { GameState } from '../state/GameState'

const CLASSES = [
  { cls: 'Warrior', role: 'Tank / Melee DPS', desc: 'High HP and defense' },
  { cls: 'Mage',    role: 'Ranged DPS',       desc: 'High attack and crit' },
  { cls: 'Priest',  role: 'Support / Healer', desc: 'High mana and CDR' },
] as const

export class CharacterCreateScene extends Phaser.Scene {
  private selectedClass: string | null = null
  private confirmBtn!: Phaser.GameObjects.Rectangle
  private confirmLabel!: Phaser.GameObjects.Text
  private errorText!: Phaser.GameObjects.Text
  private nameInput!: Phaser.GameObjects.DOMElement

  constructor() {
    super({ key: 'CharacterCreate' })
  }

  create(): void {
    const { width } = this.scale

    this.add.text(width / 2, 30, 'Create Character', {
      font: '24px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.add.text(60, 88, 'Name:', { font: '16px monospace', color: '#cccccc' })
    const inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.maxLength = 24
    inputEl.style.cssText = 'width:220px;font-size:16px;padding:4px 8px;background:#222;color:#fff;border:1px solid #555;outline:none;'
    this.nameInput = this.add.dom(300, 100, inputEl)
    inputEl.addEventListener('input', () => this.refreshConfirm())

    this.add.text(width / 2, 148, 'Choose Class', {
      font: '16px monospace',
      color: '#cccccc',
    }).setOrigin(0.5)

    const cardW = 200
    const cardH = 120
    const cardY = 250
    const positions = [180, 400, 620]
    const classBgs: Phaser.GameObjects.Rectangle[] = []

    CLASSES.forEach(({ cls, role, desc }, i) => {
      const x = positions[i]
      const bg = this.add.rectangle(x, cardY, cardW, cardH, 0x222222)
        .setStrokeStyle(1, 0x444444)
        .setInteractive({ useHandCursor: true })
      classBgs.push(bg)

      this.add.text(x, cardY - 44, cls,  { font: '18px monospace', color: '#ffffff' }).setOrigin(0.5)
      this.add.text(x, cardY - 18, role, { font: '12px monospace', color: '#aaaaaa' }).setOrigin(0.5)
      this.add.text(x, cardY + 6,  desc, { font: '12px monospace', color: '#888888' }).setOrigin(0.5)

      bg.on('pointerdown', () => {
        this.selectedClass = cls
        classBgs.forEach((b, j) => b.setFillStyle(j === i ? 0x334455 : 0x222222))
        this.refreshConfirm()
      })
      bg.on('pointerover', () => { if (this.selectedClass !== cls) bg.setFillStyle(0x2a2a2a) })
      bg.on('pointerout',  () => { if (this.selectedClass !== cls) bg.setFillStyle(0x222222) })
    })

    this.confirmBtn = this.add.rectangle(width / 2, 370, 200, 44, 0x333333)
      .setStrokeStyle(1, 0x555555)
    this.confirmLabel = this.add.text(width / 2, 370, 'Confirm', {
      font: '18px monospace',
      color: '#666666',
    }).setOrigin(0.5)

    this.errorText = this.add.text(width / 2, 424, '', {
      font: '14px monospace',
      color: '#ff4444',
    }).setOrigin(0.5)
  }

  private refreshConfirm(): void {
    const inputEl = this.nameInput.node as HTMLInputElement
    const ready = inputEl.value.trim().length > 0 && this.selectedClass !== null

    this.confirmBtn.setFillStyle(ready ? 0x334455 : 0x333333)
    this.confirmBtn.setStrokeStyle(1, ready ? 0x6688aa : 0x555555)
    this.confirmLabel.setColor(ready ? '#ffffff' : '#666666')

    this.confirmBtn.removeAllListeners('pointerdown')
    if (ready) {
      this.confirmBtn.setInteractive({ useHandCursor: true })
      this.confirmBtn.on('pointerdown', () => void this.submit())
    } else {
      this.confirmBtn.disableInteractive()
    }
  }

  private async submit(): Promise<void> {
    const inputEl = this.nameInput.node as HTMLInputElement
    const name = inputEl.value.trim()
    if (!name || !this.selectedClass) return

    this.confirmBtn.disableInteractive()
    this.confirmLabel.setText('Creating...')
    this.errorText.setText('')

    try {
      const char = await createCharacter(name, this.selectedClass)
      GameState.instance.character = char
      this.nameInput.destroy()
      this.scene.start('Hub')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.errorText.setText('Error: ' + msg)
      this.confirmBtn.setInteractive({ useHandCursor: true })
      this.confirmLabel.setText('Confirm')
    }
  }
}
