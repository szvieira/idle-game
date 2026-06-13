import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES } from './BaseCombat'
import type { EnemyState } from './BaseCombat'
import { GameState } from '../state/GameState'
import { completeExpedition } from '../api/items'
import { startExpedition } from '../api/expedition'

const DROP_CHANCE   = 0.10
const UNCOMMON_ODDS = 0.25 // at zone >= 2

const EXPEDITION_ITEM_POOLS: Record<string, string[]> = {
  Common:   ['Iron Sword','Leather Chestplate','Leather Boots','Copper Ring'],
  Uncommon: ["Soldier's Sword","Scout's Helm",'Quartz Amulet'],
}

export class ExpeditionScene extends BaseCombat {
  private zone = 1
  private room = 1
  private txtZone!: Phaser.GameObjects.Text
  private txtRoom!: Phaser.GameObjects.Text

  constructor() { super({ key: 'Expedition' }) }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.busy = false; this.menuOpen = false; this.portal = null
    this.sessionXP = 0; this.sessionGold = 0; this.sessionItems = []
    this.zone = 1; this.room = 1
    this.enemies = []
    this.moveTo = null

    // Start/resume expedition run
    try {
      const run = await startExpedition(char.id, 'forest')
      GameState.instance.expeditionRun = run
    } catch { /* continue even if run tracking fails */ }

    this.buildArena(0x1a2a1e)
    this.buildHero()
    this.setupInput()
    this.buildCoreHUD()
    this.txtZone = this.add.text(16, 14, '', this.font(13,'#ffd34d')).setDepth(20)
    this.txtRoom = this.add.text(16, 38, '', this.font(10)).setDepth(20)
    this.refreshCoreHUD()
    this.spawnRoom()
  }

  update(time: number, delta: number): void { this.baseUpdate(time, delta) }

  protected menuOptions() {
    return [
      { label:'CONTINUE EXPEDITION', color:'#5ec05e', onPick: () => { /* close menu */ } },
      { label:'DUNGEON: FORSAKEN CRYPT', color:'#c45aff', onPick: () => this.exitTo('Dungeon') },
      { label:'BACK TO CAMP', onPick: () => this.exitTo('Lobby') },
    ]
  }

  private spawnRoom(): void {
    const scale = 1 + (this.zone-1)*0.45 + (this.room-1)*0.12
    const total = 5 + Math.min(this.room, 3)
    const pool  = ENEMY_TYPES.slice(0, Math.min(1 + this.room, 3))
    this.enemies = this.spawnPacks(total, scale, pool)
    this.txtZone.setText(`ZONE ${this.zone}`)
    this.txtRoom.setText(`ROOM ${this.room}/3  •  ${this.enemies.length} ENEMIES`)
  }

  protected onEnemyKilled(e: EnemyState): void {
    this.sessionGold += e.gold
    this.sessionXP += Math.round(4 + e.maxHp * 0.06)
    this.floatText(e.x, e.y - 70, `+${e.gold}g`, '#ffd34d')

    // Loot roll
    if (Math.random() < DROP_CHANCE) {
      const rarity = (Math.random() < UNCOMMON_ODDS && this.zone > 1) ? 'Uncommon' : 'Common'
      const pool = EXPEDITION_ITEM_POOLS[rarity]
      if (pool?.length) {
        const itemName = Phaser.Utils.Array.GetRandom(pool)
        this.sessionItems.push(itemName)
        this.banner(itemName.toUpperCase(), rarity === 'Uncommon' ? '#5ec05e' : '#b8c0cc')
      }
    }
  }

  protected onRoomCleared(): void {
    const zoneDone = this.room === 3
    this.banner(zoneDone ? `ZONE ${this.zone} COMPLETE!` : 'ROOM CLEAR!',
      zoneDone ? '#ffd34d' : '#5ec05e')
    this.spawnPortal()
  }

  protected nextRoom(): void {
    this.removePortal()
    if (this.room === 3) {
      this.zone++; this.room = 1
      this.hero.hp = this.hero.maxHp
    } else {
      this.room++
    }
    this.enemies = []
    this.spawnRoom()
  }

  protected onHeroDown(): void {
    if (this.busy) return
    this.busy = true
    this.banner('DEFEAT...', '#c03a3a')
    this.tweens.add({ targets:this.hero.doll, angle:-90, alpha:0.4, duration:400 })
    this.time.delayedCall(2000, () => this.finishSession())
  }

  private async exitTo(scene: string): Promise<void> {
    this.menuOpen = false
    await this.reportSession()
    this.scene.start(scene)
  }

  private async finishSession(): Promise<void> {
    await this.reportSession()
    this.scene.start('Lobby')
  }

  private async reportSession(): Promise<void> {
    const run = GameState.instance.expeditionRun
    if (!run) return
    try {
      const result = await completeExpedition(run.id, this.sessionXP, this.sessionGold, this.sessionItems)
      GameState.instance.character = result.character
      GameState.instance.inventory.push(...result.items_added)
      GameState.instance.expeditionRun = null
    } catch { /* best-effort */ }
  }
}
