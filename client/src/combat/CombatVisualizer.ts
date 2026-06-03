import Phaser from 'phaser'
import type { Character, ZoneDef } from '../types/api'
import { simulateLoop } from './CombatSimulator'
import type { CombatChar, CombatEvent } from './CombatSimulator'

export class CombatVisualizer {
  private scene: Phaser.Scene
  private panelLeft: number
  private panelTop: number

  private roomText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private enemyHpBarBg!: Phaser.GameObjects.Rectangle
  private enemyHpBar!: Phaser.GameObjects.Rectangle
  private enemyNameText!: Phaser.GameObjects.Text
  private enemyRect!: Phaser.GameObjects.Rectangle
  private playerRect!: Phaser.GameObjects.Rectangle
  private playerLabel!: Phaser.GameObjects.Text
  private playerHpBarBg!: Phaser.GameObjects.Rectangle
  private playerHpBar!: Phaser.GameObjects.Rectangle

  private objects: Phaser.GameObjects.GameObject[] = []
  private timerEvent: Phaser.Time.TimerEvent | null = null
  private events: CombatEvent[] = []
  private eventIndex = 0
  private char: Character | null = null
  private zoneDef: ZoneDef | null = null
  private curEnemyHp = 0
  private curEnemyMaxHp = 1
  private curPlayerHp = 0
  private curPlayerMaxHp = 1

  constructor(scene: Phaser.Scene, panelLeft: number, panelTop: number) {
    this.scene = scene
    this.panelLeft = panelLeft
    this.panelTop = panelTop
  }

  start(char: Character, zoneDef: ZoneDef): void {
    this.stop()
    this.char = char
    this.zoneDef = zoneDef
    this.buildUI()
    this.runNextLoop()
  }

  stop(): void {
    if (this.timerEvent) { this.timerEvent.destroy(); this.timerEvent = null }
    for (const obj of this.objects) obj.destroy()
    this.objects = []
  }

  private ax(relX: number): number { return this.panelLeft + relX }
  private ay(relY: number): number { return this.panelTop + relY }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj)
    return obj
  }

  private buildUI(): void {
    const s = this.scene
    const barW = 200

    this.roomText = this.track(s.add.text(this.ax(108), this.ay(5), '', {
      font: '11px monospace', color: '#666666',
    }).setOrigin(0.5, 0))

    this.statusText = this.track(s.add.text(this.ax(108), this.ay(16), '', {
      font: '10px monospace', color: '#aaaaaa',
    }).setOrigin(0.5, 0))

    this.enemyHpBarBg = this.track(s.add.rectangle(this.ax(108), this.ay(32), barW, 6, 0x440000))
    this.enemyHpBar   = this.track(s.add.rectangle(this.ax(8 + barW / 2), this.ay(32), barW, 6, 0xcc2222))

    this.enemyNameText = this.track(s.add.text(this.ax(108), this.ay(42), '', {
      font: '11px monospace', color: '#ffaaaa',
    }).setOrigin(0.5, 0))

    this.enemyRect = this.track(s.add.rectangle(this.ax(136), this.ay(87), 38, 50, 0x5a0000).setStrokeStyle(1, 0xff4444))
    this.track(s.add.text(this.ax(136), this.ay(87), 'E', { font: '14px monospace', color: '#ff6666' }).setOrigin(0.5))

    this.playerRect = this.track(s.add.rectangle(this.ax(80), this.ay(87), 34, 50, 0x1a2a5e).setStrokeStyle(1, 0x4488ff))
    this.playerLabel = this.track(s.add.text(this.ax(80), this.ay(87), this.char?.class?.[0] ?? '?', {
      font: '14px monospace', color: '#88bbff',
    }).setOrigin(0.5))

    this.playerHpBarBg = this.track(s.add.rectangle(this.ax(108), this.ay(157), barW, 6, 0x004400))
    this.playerHpBar   = this.track(s.add.rectangle(this.ax(8 + barW / 2), this.ay(157), barW, 6, 0x22cc22))

    this.curPlayerHp    = this.char?.max_hp ?? 1
    this.curPlayerMaxHp = this.char?.max_hp ?? 1
    this.updateHpBars()
  }

  private toCombatChar(): CombatChar {
    const c = this.char!
    return {
      hp: c.max_hp, maxHp: c.max_hp,
      attack: c.attack, defense: c.defense, critical: c.critical,
      class: c.class,
      specialName: c.special_name, specialMult: c.special_mult,
      specialHeal: c.special_heal, specialCd: c.special_cd,
    }
  }

  private runNextLoop(): void {
    if (!this.char || !this.zoneDef) return
    this.events = simulateLoop(this.toCombatChar(), this.zoneDef)
    this.eventIndex = 0
    this.scheduleNext(300)
  }

  private scheduleNext(delay = 600): void {
    this.timerEvent = this.scene.time.addEvent({
      delay,
      callback: this.processNext,
      callbackScope: this,
    })
  }

  private processNext(): void {
    if (this.eventIndex >= this.events.length) { this.runNextLoop(); return }
    const event = this.events[this.eventIndex++]
    this.applyEvent(event)
    if      (event.type === 'player_death')  this.scheduleNext(2200)
    else if (event.type === 'loop_complete') this.runNextLoop()
    else                                     this.scheduleNext(600)
  }

  private applyEvent(event: CombatEvent): void {
    switch (event.type) {
      case 'enemy_intro':
        this.curEnemyHp    = event.hp
        this.curEnemyMaxHp = event.maxHp
        this.enemyNameText.setText(event.name)
        this.enemyRect.setFillStyle(0x5a0000)
        this.statusText.setStyle({ color: '#666666' }).setText('')
        this.updateHpBars()
        break

      case 'player_attack': {
        this.curEnemyHp  = event.enemyHp
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        const label = event.isSpecial ? `${event.specialName}!` : 'Attack'
        const color = event.isCrit ? '#ffff44' : '#aaaaaa'
        this.statusText.setStyle({ color }).setText(`${label}: ${event.damage}${event.isCrit ? ' CRIT!' : ''}`)
        this.floatText(this.ax(136), this.ay(60), `-${event.damage}`, event.isCrit ? '#ffff44' : '#ffffff')
        break
      }

      case 'player_heal':
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        this.statusText.setStyle({ color: '#44ff88' }).setText(`${event.specialName}: +${event.amount}`)
        this.floatText(this.ax(80), this.ay(60), `+${event.amount}`, '#44ff44')
        break

      case 'enemy_attack':
        this.curPlayerHp = event.playerHp
        this.updateHpBars()
        this.statusText.setStyle({ color: '#ff8866' }).setText(`${event.attackerName}: ${event.damage}${event.isCrit ? ' CRIT!' : ''}`)
        this.floatText(this.ax(80), this.ay(60), `-${event.damage}`, event.isCrit ? '#ff6644' : '#ff4444')
        break

      case 'enemy_death':
        this.enemyRect.setFillStyle(0x330000)
        this.statusText.setStyle({ color: '#888888' }).setText(`${event.name} defeated!`)
        break

      case 'room_complete':
        this.roomText.setText(`Room ${event.roomIndex + 1} / ${event.totalRooms}`)
        break

      case 'player_death':
        this.curPlayerHp = 0
        this.updateHpBars()
        this.playerRect.setFillStyle(0x440000)
        this.statusText.setStyle({ color: '#ff4444' }).setText('DEFEATED — respawning...')
        break

      case 'loop_complete':
        break
    }
  }

  private updateHpBars(): void {
    const barW = 200

    const ePct = this.curEnemyMaxHp > 0 ? Math.max(0, this.curEnemyHp / this.curEnemyMaxHp) : 0
    const eW   = Math.max(1, barW * ePct)
    this.enemyHpBar.setSize(eW, 6)
    this.enemyHpBar.setX(this.panelLeft + 8 + eW / 2)

    const pPct = this.curPlayerMaxHp > 0 ? Math.max(0, this.curPlayerHp / this.curPlayerMaxHp) : 0
    const pW   = Math.max(1, barW * pPct)
    this.playerHpBar.setSize(pW, 6)
    this.playerHpBar.setX(this.panelLeft + 8 + pW / 2)
  }

  private floatText(worldX: number, worldY: number, text: string, color: string): void {
    const t = this.scene.add.text(worldX, worldY, text, { font: '13px monospace', color }).setOrigin(0.5)
    this.scene.tweens.add({
      targets: t, y: worldY - 28, alpha: 0,
      duration: 900, ease: 'Power1',
      onComplete: () => t.destroy(),
    })
  }
}
