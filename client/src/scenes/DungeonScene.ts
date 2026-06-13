import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES } from './BaseCombat'
import type { EnemyState } from './BaseCombat'
import { GameState } from '../state/GameState'
import { request } from '../api/client'
import type { CompleteExpeditionResult } from '../types/api'

const DUNGEON_ITEM_POOL = ['Crypt Blade',"Watcher's Helm",'Sepulchral Ring','Silent Boots']
const EPIC_POOL         = ["Crypt Lord's Mantle",'Profane Axe','Crown of Bones']
const TOTAL_ROOMS       = 6

export class DungeonScene extends BaseCombat {
  private roomIndex = 0
  private dungeonId   = 'forsaken_crypt'
  private dungeonLabel = 'The Forsaken Crypt'
  private txtRoom!: Phaser.GameObjects.Text

  constructor() { super({ key: 'Dungeon' }) }

  init(data?: { dungeonId?: string; dungeonName?: string }): void {
    this.dungeonId    = data?.dungeonId   ?? 'forsaken_crypt'
    this.dungeonLabel = data?.dungeonName ?? 'The Forsaken Crypt'
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
    // Use harder enemies for later rooms
    const pool = isBoss
      ? [{ ...ENEMY_TYPES[2], key:'boss', name:'Crypt Boss', hp:300, atk:22, atkSpeed:2.5, gold:50, speed:60, aggro:300, range:70 }]
      : ENEMY_TYPES.slice(1, 3) // bats + skeletons only
    this.enemies = this.spawnPacks(total, scale, pool)
    if (isBoss && this.enemies[0]) {
      this.enemies[0].boss = true
      this.enemies[0].barW = 80
      this.enemies[0].barOff = 70
      // Boss visual weight: larger sprite + ominous red tint
      this.enemies[0].sprite.setScale(1.5).setTint(0xff5544)
      this.enemies[0].shadow.setSize(70, 16)
    }
    this.txtRoom.setText(isBoss ? 'BOSS ROOM' : `ROOM ${this.roomIndex+1}/${TOTAL_ROOMS}`)
  }

  protected onEnemyKilled(e: EnemyState): void {
    this.sessionGold += e.gold
    this.sessionXP   += Math.round(8 + e.maxHp * 0.1)
    // Drop chance: 5% Epic, else 15% Rare per enemy
    const roll = Math.random()
    if (roll < 0.05) {
      const itemName = Phaser.Utils.Array.GetRandom(EPIC_POOL)
      this.sessionItems.push(itemName)
      this.banner(itemName.toUpperCase(), '#c45aff')
    } else if (roll < 0.20) {
      const itemName = Phaser.Utils.Array.GetRandom(DUNGEON_ITEM_POOL)
      this.sessionItems.push(itemName)
      this.banner(itemName.toUpperCase(), '#4da3ff')
    }
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
    this.banner('DEFEATED — loot lost', '#c03a3a')
    this.tweens.add({ targets:this.hero.doll, angle:-90, alpha:0.4, duration:400 })
    // On death: no loot, just return
    this.time.delayedCall(2000, () => this.scene.start('Lobby'))
  }

  private async finishSession(): Promise<void> {
    const char = GameState.instance.character!
    const oldLevel = char.level
    try {
      const result = await request<CompleteExpeditionResult>(
        'POST', '/dungeon-complete', {
          character_id: char.id,
          xp:    this.sessionXP,
          gold:  this.sessionGold,
          items: this.sessionItems,
        })
      GameState.instance.character = result.character
      GameState.instance.inventory.push(...result.items_added)

      if (result.character.level > oldLevel) {
        this.banner(`LEVEL UP!  Lv.${result.character.level}`, '#ffd34d')
        await new Promise<void>(resolve => { this.time.delayedCall(2200, resolve) })
      }
    } catch { /* best-effort */ }
    this.scene.start('Lobby')
  }
}
