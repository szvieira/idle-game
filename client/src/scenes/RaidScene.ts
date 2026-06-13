import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { RaidSocket } from '../net/RaidSocket'
import { ARENA, FONT, H, W } from './BaseCombat'
import type { EnemyState, PlayerState, StateTick } from '../net/raid-types'

export class RaidScene extends Phaser.Scene {
  private socket: RaidSocket | null = null
  private playerSprites: Map<string, PaperDollContainer> = new Map()
  private playerHpBars: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private enemySprites: Map<number, Phaser.GameObjects.Image> = new Map()
  private enemyHpBars: Map<number, Phaser.GameObjects.Graphics> = new Map()
  private statusText!: Phaser.GameObjects.Text
  private runId = ''

  constructor() { super({ key: 'Raid' }) }

  init(data: { runId: string }): void {
    this.runId = data.runId
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.add.rectangle(W / 2, H / 2, W, H, 0x1c1426)
    const g = this.add.graphics()
    g.fillStyle(0x1b1524, 1)
    g.fillRect(0, ARENA.y1 - 25, W, H - ARENA.y1 + 25)

    this.statusText = this.add.text(W / 2, 20, 'RAID IN PROGRESS', {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#ffd34d',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.worldY < ARENA.y1 - 30) return
      const x = Phaser.Math.Clamp(pointer.worldX, ARENA.x1, ARENA.x2)
      const y = Phaser.Math.Clamp(pointer.worldY, ARENA.y1, ARENA.y2)
      this.socket?.sendMove(x, y)
    })

    const skillBtn = this.add.rectangle(W - 90, H - 90, 88, 88, 0x241c2e)
      .setStrokeStyle(4, 0xffd34d)
      .setInteractive({ useHandCursor: true })
      .setDepth(20)
    this.add.text(W - 90, H - 90, 'SKILL', {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#7fd4ff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21)
    skillBtn.on('pointerdown', () => this.socket?.sendSkill())

    this.socket = new RaidSocket(this.runId, char.id, {
      onState: (tick) => this.applyState(tick),
      onDamage: (ev) => this.showDamage(ev.x, ev.y, ev.amount, ev.crit),
      onEnd: (msg) => this.onRaidEnd(msg.outcome),
    })
    this.socket.connect()
    this.events.once('shutdown', () => this.shutdownRaid())
  }

  private applyState(tick: StateTick): void {
    for (const player of tick.players) this.syncPlayer(player)
    for (const enemy of tick.enemies) this.syncEnemy(enemy)
  }

  private syncPlayer(player: PlayerState): void {
    if (player.dead) {
      this.playerSprites.get(player.id)?.destroy()
      this.playerSprites.delete(player.id)
      this.playerHpBars.get(player.id)?.destroy()
      this.playerHpBars.delete(player.id)
      return
    }

    let doll = this.playerSprites.get(player.id)
    if (!doll) {
      doll = new PaperDollContainer(this, player.x, player.y).setDepth(3)
      if (player.id !== GameState.instance.character?.id) {
        const base = (doll as unknown as { base?: Phaser.GameObjects.Image }).base
        base?.setTint(0x88aaff)
      }
      this.playerSprites.set(player.id, doll)
    }
    doll.setPosition(player.x, player.y)

    let bar = this.playerHpBars.get(player.id)
    if (!bar) {
      bar = this.add.graphics().setDepth(8)
      this.playerHpBars.set(player.id, bar)
    }
    bar.clear()
    bar.fillStyle(0x1a1a2e)
    bar.fillRect(player.x - 28, player.y - 52, 56, 6)
    bar.fillStyle(0x5ec05e)
    bar.fillRect(player.x - 28, player.y - 52, Math.round(56 * (player.hp / player.max_hp)), 6)
  }

  private syncEnemy(enemy: EnemyState): void {
    if (enemy.dead) {
      this.enemySprites.get(enemy.id)?.destroy()
      this.enemySprites.delete(enemy.id)
      this.enemyHpBars.get(enemy.id)?.destroy()
      this.enemyHpBars.delete(enemy.id)
      return
    }

    let sprite = this.enemySprites.get(enemy.id)
    if (!sprite) {
      sprite = this.add.image(enemy.x, enemy.y, 'spr_boss').setDepth(3)
      this.enemySprites.set(enemy.id, sprite)
    }
    sprite.setPosition(enemy.x, enemy.y)

    let bar = this.enemyHpBars.get(enemy.id)
    if (!bar) {
      bar = this.add.graphics().setDepth(8)
      this.enemyHpBars.set(enemy.id, bar)
    }
    bar.clear()
    bar.fillStyle(0x1a1a2e)
    bar.fillRect(enemy.x - 40, enemy.y - 60, 80, 8)
    bar.fillStyle(0xc03a3a)
    bar.fillRect(enemy.x - 40, enemy.y - 60, Math.round(80 * (enemy.hp / enemy.max_hp)), 8)
  }

  private showDamage(x: number, y: number, damage: number, crit: boolean): void {
    const txt = this.add.text(x, y, String(damage), {
      fontFamily: FONT,
      fontSize: `${crit ? 16 : 12}px`,
      color: crit ? '#ffffff' : '#ffdd88',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15)
    this.tweens.add({
      targets: txt,
      y: y - 48,
      alpha: 0,
      duration: crit ? 900 : 700,
      ease: 'Quad.out',
      onComplete: () => txt.destroy(),
    })
  }

  private onRaidEnd(outcome: 'victory' | 'defeat'): void {
    this.statusText.setText(outcome === 'victory' ? 'VICTORY!' : 'DEFEATED')
      .setColor(outcome === 'victory' ? '#ffd34d' : '#c03a3a')
    this.time.delayedCall(3000, () => this.scene.start('Lobby'))
  }

  private shutdownRaid(): void {
    this.socket?.disconnect()
    this.socket = null
    for (const doll of this.playerSprites.values()) doll.destroy()
    for (const bar of this.playerHpBars.values()) bar.destroy()
    for (const sprite of this.enemySprites.values()) sprite.destroy()
    for (const bar of this.enemyHpBars.values()) bar.destroy()
    this.playerSprites.clear()
    this.playerHpBars.clear()
    this.enemySprites.clear()
    this.enemyHpBars.clear()
  }
}
