import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES } from './BaseCombat'
import type { EnemyState } from './BaseCombat'
import { GameState } from '../state/GameState'
import { createDungeonRun, claimDungeonRun } from '../api/dungeons'
import type { InventoryItem } from '../types/api'

const TOTAL_ROOMS = 6

export class DungeonScene extends BaseCombat {
  private roomIndex    = 0
  private dungeonId    = 'normal'
  private dungeonLabel = 'The Crypt'
  private enemyHpMult  = 1
  private enemyAtkMult = 1
  private goldMult     = 1
  private txtRoom!: Phaser.GameObjects.Text

  constructor() { super({ key: 'Dungeon' }) }

  init(data?: { dungeonId?: string; dungeonName?: string; enemyHpMult?: number; enemyAtkMult?: number; goldMult?: number }): void {
    this.dungeonId    = data?.dungeonId    ?? 'normal'
    this.dungeonLabel = data?.dungeonName  ?? 'The Crypt'
    this.enemyHpMult  = data?.enemyHpMult  ?? 1
    this.enemyAtkMult = data?.enemyAtkMult ?? 1
    this.goldMult     = data?.goldMult     ?? 1
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.busy = false; this.menuOpen = false; this.portal = null
    this.sessionXP = 0; this.sessionGold = 0; this.sessionItems = []
    this.roomIndex = 0
    this.enemies = []
    this.moveTo = null

    this.buildArena(0x2a1a18)
    this.buildHero()
    this.setupInput()
    this.buildCoreHUD()
    this.txtRoom = this.add.text(16, 14, '', this.font(13,'#c45aff')).setDepth(20)
    this.add.text(16, 38, this.dungeonLabel.toUpperCase(), this.font(7,'#6a3a8a')).setDepth(20)
    this.refreshCoreHUD()
    this.spawnDungeonRoom()
  }

  update(time: number, delta: number): void { this.baseUpdate(time, delta) }

  protected menuOptions() {
    return [
      { label:'CONTINUE DUNGEON', color:'#c45aff', onPick: () => { /* close menu */ } },
      { label:'ABANDON (lose loot)', color:'#c03a3a', onPick: () => this.scene.start('Lobby') },
    ]
  }

  private spawnDungeonRoom(): void {
    const scale  = 1 + this.roomIndex * 0.3
    const isBoss = this.roomIndex === TOTAL_ROOMS - 1
    const total  = isBoss ? 1 : 4 + Math.min(this.roomIndex, 3)

    const basePool = isBoss
      ? [{ ...ENEMY_TYPES[2], key:'boss', name:'Crypt Boss', hp:300, atk:22, atkSpeed:2.5, gold:50, speed:60, aggro:300, range:70 }]
      : ENEMY_TYPES.slice(1, 3)

    // Apply dungeon-tier multipliers to base stats before room scaling
    const pool = basePool.map(def => ({
      ...def,
      hp:   Math.round(def.hp   * this.enemyHpMult),
      atk:  Math.round(def.atk  * this.enemyAtkMult),
      gold: Math.round(def.gold * this.goldMult),
    }))

    this.enemies = this.spawnPacks(total, scale, pool)
    if (isBoss && this.enemies[0]) {
      this.enemies[0].boss = true
      this.enemies[0].barW = 80
      this.enemies[0].barOff = 70
      this.enemies[0].sprite.setScale(1.5).setTint(0xff5544)
      this.enemies[0].shadow.setSize(70, 16)
    }
    this.txtRoom.setText(isBoss ? 'BOSS ROOM' : `ROOM ${this.roomIndex+1}/${TOTAL_ROOMS}`)
  }

  protected onEnemyKilled(e: EnemyState): void {
    this.sessionGold += e.gold
    this.sessionXP   += Math.round(8 + e.maxHp * 0.1)
  }

  protected onRoomCleared(): void {
    if (this.roomIndex >= TOTAL_ROOMS - 1) {
      this.banner('DUNGEON COMPLETE!', '#ffd34d')
      this.busy = true
      this.time.delayedCall(1500, () => this.finishSession())
    } else {
      this.banner('ROOM CLEAR!', '#5ec05e')
      this.spawnPortal()
    }
  }

  protected nextRoom(): void {
    this.removePortal()
    this.roomIndex++
    this.enemies = []
    this.spawnDungeonRoom()
  }

  protected onHeroDown(): void {
    if (this.busy) return
    this.busy = true
    this.banner('DEFEATED — no rewards', '#c03a3a')
    this.tweens.add({ targets:this.hero.doll, angle:-90, alpha:0.4, duration:400 })
    this.time.delayedCall(2000, () => this.scene.start('Lobby'))
  }

  private async finishSession(): Promise<void> {
    const char = GameState.instance.character!
    const oldLevel = char.level
    try {
      const run = await createDungeonRun(this.dungeonId, char.id)
      const claim = await claimDungeonRun(run.run_id, char.id)

      GameState.instance.character = claim.character

      if (claim.character.level > oldLevel) {
        this.banner(`LEVEL UP!  Lv.${claim.character.level}`, '#ffd34d')
        await new Promise<void>(resolve => { this.time.delayedCall(2000, resolve) })
      }

      for (const loot of claim.loot) {
        const invItem: InventoryItem = {
          id: loot.inventory_item_id,
          character_id: char.id,
          item_template_id: '',
          template: {
            id: '',
            name: loot.name,
            slot: loot.slot as InventoryItem['template']['slot'],
            rarity: loot.rarity as InventoryItem['template']['rarity'],
            source: 'dungeon',
            attack_bonus: 0,
            defense_bonus: 0,
            hp_bonus: 0,
            crit_bonus: 0,
            cdr_bonus: 0,
          },
        }
        GameState.instance.inventory.push(invItem)
        this.banner(`DROP: ${loot.name} (${loot.rarity})`, '#ffd34d')
        await new Promise<void>(resolve => { this.time.delayedCall(2000, resolve) })
      }
    } catch { /* best-effort */ }
    this.scene.start('Lobby')
  }
}
