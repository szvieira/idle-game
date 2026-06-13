import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { RaidSocket } from '../net/RaidSocket'
import { ARENA, FONT, H, W } from './BaseCombat'
import type { EnemyState, PlayerState, StateTick } from '../net/raid-types'

interface PosData { x: number; y: number }
interface HpData  { hp: number; maxHp: number }

export class RaidScene extends Phaser.Scene {
  private socket: RaidSocket | null = null
  private playerSprites: Map<string, PaperDollContainer> = new Map()
  private playerHpBars: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private enemySprites: Map<number, Phaser.GameObjects.Image> = new Map()
  private enemyHpBars: Map<number, Phaser.GameObjects.Graphics> = new Map()

  // Target positions from the server — lerped toward every frame
  private playerTargets: Map<string, PosData> = new Map()
  private enemyTargets:  Map<number, PosData> = new Map()
  // Latest HP values from the server — used when redrawing bars each frame
  private playerHpData:  Map<string, HpData>  = new Map()
  private enemyHpData:   Map<number, HpData>  = new Map()

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
      this.playerTargets.delete(player.id)
      this.playerHpData.delete(player.id)
      return
    }

    if (!this.playerSprites.has(player.id)) {
      const doll = new PaperDollContainer(this, player.x, player.y).setDepth(3)
      if (player.id !== GameState.instance.character?.id) {
        const base = (doll as unknown as { base?: Phaser.GameObjects.Image }).base
        base?.setTint(0x88aaff)
      }
      this.playerSprites.set(player.id, doll)
      this.playerHpBars.set(player.id, this.add.graphics().setDepth(8))
    }

    // Store target — the update loop lerps toward it
    this.playerTargets.set(player.id, { x: player.x, y: player.y })
    this.playerHpData.set(player.id, { hp: player.hp, maxHp: player.max_hp })
  }

  private syncEnemy(enemy: EnemyState): void {
    if (enemy.dead) {
      this.enemySprites.get(enemy.id)?.destroy()
      this.enemySprites.delete(enemy.id)
      this.enemyHpBars.get(enemy.id)?.destroy()
      this.enemyHpBars.delete(enemy.id)
      this.enemyTargets.delete(enemy.id)
      this.enemyHpData.delete(enemy.id)
      return
    }

    if (!this.enemySprites.has(enemy.id)) {
      this.enemySprites.set(enemy.id, this.add.image(enemy.x, enemy.y, 'spr_boss').setDepth(3))
      this.enemyHpBars.set(enemy.id, this.add.graphics().setDepth(8))
    }

    this.enemyTargets.set(enemy.id, { x: enemy.x, y: enemy.y })
    this.enemyHpData.set(enemy.id, { hp: enemy.hp, maxHp: enemy.max_hp })
  }

  update(_time: number, delta: number): void {
    // Lerp sprites toward server-authoritative positions every frame.
    // Server ticks at 20 Hz (50 ms); this keeps motion fluid between ticks.
    const alpha = Math.min(1, delta * 0.014)

    for (const [id, doll] of this.playerSprites) {
      const target = this.playerTargets.get(id)
      if (!target) continue
      const nx = doll.x + (target.x - doll.x) * alpha
      const ny = doll.y + (target.y - doll.y) * alpha
      doll.setPosition(nx, ny)

      const bar  = this.playerHpBars.get(id)
      const data = this.playerHpData.get(id)
      if (bar && data) {
        bar.clear()
        bar.fillStyle(0x1a1a2e)
        bar.fillRect(nx - 28, ny - 52, 56, 6)
        bar.fillStyle(0x5ec05e)
        bar.fillRect(nx - 28, ny - 52, Math.round(56 * (data.hp / data.maxHp)), 6)
      }
    }

    for (const [id, sprite] of this.enemySprites) {
      const target = this.enemyTargets.get(id)
      if (!target) continue
      const nx = sprite.x + (target.x - sprite.x) * alpha
      const ny = sprite.y + (target.y - sprite.y) * alpha
      sprite.setPosition(nx, ny)

      const bar  = this.enemyHpBars.get(id)
      const data = this.enemyHpData.get(id)
      if (bar && data) {
        bar.clear()
        bar.fillStyle(0x1a1a2e)
        bar.fillRect(nx - 40, ny - 60, 80, 8)
        bar.fillStyle(0xc03a3a)
        bar.fillRect(nx - 40, ny - 60, Math.round(80 * (data.hp / data.maxHp)), 8)
      }
    }
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
    this.playerTargets.clear()
    this.enemyTargets.clear()
    this.playerHpData.clear()
    this.enemyHpData.clear()
  }
}
