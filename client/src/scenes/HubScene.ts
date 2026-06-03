import Phaser from 'phaser'
import type { ExpeditionRun } from '../types/api'
import { startExpedition, collectExpedition } from '../api/expedition'
import { GameState } from '../state/GameState'
import { formatElapsed } from '../utils'

export class HubScene extends Phaser.Scene {
  private elapsedText!: Phaser.GameObjects.Text
  private collectResultText!: Phaser.GameObjects.Text
  private cannotSurviveText!: Phaser.GameObjects.Text
  private timerEvent!: Phaser.Time.TimerEvent

  constructor() {
    super({ key: 'Hub' })
  }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) {
      this.scene.start('CharacterSelect')
      return
    }

    try {
      const run = await startExpedition(char.id, 'forest')
      GameState.instance.expeditionRun = run
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, { font: '14px monospace', color: '#ff4444' })
      return
    }

    this.buildUI()
  }

  private buildUI(): void {
    if (this.timerEvent) this.timerEvent.destroy()
    this.children.removeAll(true)

    const char = GameState.instance.character!
    const run = GameState.instance.expeditionRun!
    const { width } = this.scale

    // Header bar
    this.add.rectangle(width / 2, 25, width, 50, 0x1a1a2e)
    this.add.text(20, 12, `${char.name}    ${char.class}    Lv.${char.level}`, {
      font: '16px monospace',
      color: '#ffffff',
    })

    this.buildExpeditionPanel(run)
    this.buildDungeonPanel()
    this.buildRaidPanel()

    // Character Sheet nav
    const sheetBtn = this.add.rectangle(200, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(200, 560, 'Character Sheet', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    sheetBtn.on('pointerover', () => sheetBtn.setFillStyle(0x445566))
    sheetBtn.on('pointerout',  () => sheetBtn.setFillStyle(0x334455))
    sheetBtn.on('pointerdown', () => this.scene.start('CharacterSheet'))

    // Switch Character nav
    const switchBtn = this.add.rectangle(600, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(600, 560, 'Switch Character', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    switchBtn.on('pointerover', () => switchBtn.setFillStyle(0x445566))
    switchBtn.on('pointerout',  () => switchBtn.setFillStyle(0x334455))
    switchBtn.on('pointerdown', () => this.scene.start('CharacterSelect'))

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.tickElapsed,
      callbackScope: this,
      loop: true,
    })
  }

  private buildExpeditionPanel(run: ExpeditionRun): void {
    const cx = 140
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)

    this.add.text(cx, 192, 'Expedition', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 220, run.zone_name, { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    this.elapsedText = this.add.text(cx, 248, `Time: ${formatElapsed(run.elapsed_seconds)}`, {
      font: '14px monospace',
      color: '#cccccc',
    }).setOrigin(0.5)

    this.cannotSurviveText = this.add.text(cx, 278, 'Cannot survive this zone!', {
      font: '12px monospace',
      color: '#ff8844',
    }).setOrigin(0.5).setVisible(false)

    this.collectResultText = this.add.text(cx, 302, '', {
      font: '12px monospace',
      color: '#88ff88',
    }).setOrigin(0.5)

    const collectBtn = this.add.rectangle(cx, 340, 140, 36, 0x225522)
      .setStrokeStyle(1, 0x44aa44)
      .setInteractive({ useHandCursor: true })
    this.add.text(cx, 340, 'Collect', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)

    collectBtn.on('pointerover', () => collectBtn.setFillStyle(0x336633))
    collectBtn.on('pointerout',  () => collectBtn.setFillStyle(0x225522))
    collectBtn.on('pointerdown', async () => {
      collectBtn.disableInteractive()
      try {
        const result = await collectExpedition(GameState.instance.expeditionRun!.id)
        if (result.cannot_survive) {
          this.cannotSurviveText.setVisible(true)
          this.collectResultText.setText('')
        } else {
          GameState.instance.character = result.character
          GameState.instance.expeditionRun = {
            ...GameState.instance.expeditionRun!,
            elapsed_seconds: 0,
          }
          this.cannotSurviveText.setVisible(false)
          this.collectResultText.setText(`+${result.xp_gained} XP  +${result.gold_gained} G`)
          this.elapsedText.setText(`Time: ${formatElapsed(0)}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error'
        this.collectResultText.setText('Error: ' + msg)
      }
      collectBtn.setInteractive({ useHandCursor: true })
    })
  }

  private buildDungeonPanel(): void {
    const cx = 400
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Dungeon', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'The Forsaken Crypt', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    this.add.rectangle(cx, 340, 160, 36, 0x333333).setStrokeStyle(1, 0x555555)
    this.add.text(cx, 340, 'Enter Dungeon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private buildRaidPanel(): void {
    const cx = 660
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Raid', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'Raid — Coming Soon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private tickElapsed(): void {
    const run = GameState.instance.expeditionRun
    if (!run) return
    run.elapsed_seconds += 1
    this.elapsedText.setText(`Time: ${formatElapsed(run.elapsed_seconds)}`)
  }
}
