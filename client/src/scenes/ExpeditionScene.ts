import Phaser from 'phaser'
import { BaseCombat, ENEMY_TYPES, FONT, W, H } from './BaseCombat'
import type { EnemyState } from './BaseCombat'
import { GameState } from '../state/GameState'
import { completeExpedition } from '../api/items'
import { startExpedition } from '../api/expedition'
import { getDungeons } from '../api/dungeons'
import type { DungeonDef } from '../api/dungeons'
import type { InventoryItem } from '../types/api'

const DROP_CHANCE   = 0.10
const UNCOMMON_ODDS = 0.25 // at zone >= 2

const EXPEDITION_ITEM_POOLS: Record<string, string[]> = {
  Common:   ['Iron Sword','Leather Chestplate','Leather Boots','Copper Ring'],
  Uncommon: ["Soldier's Sword","Scout's Helm",'Quartz Amulet'],
}

const ZONE_NAMES: Record<number, string> = {
  1: 'Forest',
  2: 'Ruins',
  3: 'Shadow Cavern',
  4: 'Obsidian Wastes',
  5: 'Void Depths',
  6: 'Abyssal Reaches',
}
function zoneName(z: number): string {
  return ZONE_NAMES[z] ?? `The Beyond`
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
    this.txtRoom = this.add.text(16, 38, '', this.font(9,'#aabbcc')).setDepth(20)
    this.refreshCoreHUD()
    this.spawnRoom()
  }

  update(time: number, delta: number): void { this.baseUpdate(time, delta) }

  protected menuOptions() {
    return [
      { label:'CONTINUE EXPEDITION', color:'#5ec05e', onPick: () => { /* close menu */ } },
      { label:'ENTER DUNGEON', color:'#c45aff', onPick: () => void this.exitToDungeon() },
      { label:'BACK TO CAMP', onPick: () => void this.exitTo('Lobby') },
    ]
  }

  private spawnRoom(): void {
    const scale = 1 + (this.zone-1)*0.45 + (this.room-1)*0.12
    const total = 5 + Math.min(this.room, 3)
    const pool  = ENEMY_TYPES.slice(0, Math.min(1 + this.room, 3))
    this.enemies = this.spawnPacks(total, scale, pool)
    this.txtZone.setText(`ZONE ${this.zone}  —  ${zoneName(this.zone).toUpperCase()}`)
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
    if (zoneDone) {
      const next = zoneName(this.zone + 1)
      this.banner(`ZONE ${this.zone} CLEAR  →  ${next.toUpperCase()}`, '#ffd34d')
    } else {
      this.banner('ROOM CLEAR!', '#5ec05e')
    }
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
    this.time.delayedCall(2000, () => void this.finishSession())
  }

  private async exitTo(scene: string): Promise<void> {
    this.menuOpen = false
    await this.reportSession()
    this.scene.start(scene)
  }

  private async exitToDungeon(): Promise<void> {
    this.menuOpen = false
    await this.reportSession()
    this.showDungeonSelect()
  }

  private showDungeonSelect(): void {
    const char = GameState.instance.character
    if (!char) return

    const overlay = this.add.container(0, 0).setDepth(80)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85))
    overlay.add(this.add.text(W/2, 70, 'SELECT DUNGEON', {
      fontFamily: FONT, fontSize: '14px', color: '#c45aff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5))

    const loading = this.add.text(W/2, 200, 'Loading…', {
      fontFamily: FONT, fontSize: '9px', color: '#888899', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5)
    overlay.add(loading)

    const cancelBtn = this.add.rectangle(W/2, H - 60, 160, 34, 0x2a2235)
      .setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    overlay.add(cancelBtn)
    overlay.add(this.add.text(W/2, H - 60, 'BACK TO CAMP', {
      fontFamily: FONT, fontSize: '8px', color: '#888899', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5))
    cancelBtn.on('pointerdown', () => { overlay.destroy(); this.scene.start('Lobby') })

    void getDungeons().then(defs => {
      loading.destroy()
      buildDungeonList(this, overlay, defs, char.level, (d) => {
        overlay.destroy()
        this.scene.start('Dungeon', { dungeonId: d.id, dungeonName: d.name, minLevel: d.min_level })
      })
    }).catch(() => { loading.setText('Could not load dungeons') })
  }

  private async finishSession(): Promise<void> {
    const { leveled, droppedItem } = await this.reportSession()
    if (leveled) {
      this.banner(`LEVEL UP!  Lv.${GameState.instance.character!.level}`, '#ffd34d')
      await new Promise<void>(resolve => { this.time.delayedCall(2000, resolve) })
    }
    if (droppedItem) {
      this.banner(`DROP: ${droppedItem.name} (${droppedItem.rarity})`, '#ffd34d')
      await new Promise<void>(resolve => { this.time.delayedCall(2000, resolve) })
    }
    this.scene.start('Lobby')
  }

  private async reportSession(): Promise<{ leveled: boolean; droppedItem: InventoryItem | null }> {
    const run = GameState.instance.expeditionRun
    if (!run) return { leveled: false, droppedItem: null }
    const char = GameState.instance.character
    const oldLevel = char?.level ?? 0
    try {
      const result = await completeExpedition(run.id, this.sessionXP, this.sessionGold, this.sessionItems)
      GameState.instance.character = result.character
      GameState.instance.inventory.push(...result.items_added)
      GameState.instance.expeditionRun = null

      let droppedItem: InventoryItem | null = null
      if (result.dropped_item) {
        const item = result.dropped_item
        droppedItem = {
          id: '',
          character_id: char?.id ?? '',
          item_template_id: item.id,
          template: {
            id: item.id,
            name: item.name,
            slot: item.slot as InventoryItem['template']['slot'],
            rarity: item.rarity as InventoryItem['template']['rarity'],
            source: 'expedition',
            attack_bonus: item.attack_bonus,
            defense_bonus: item.defense_bonus,
            hp_bonus: item.hp_bonus,
            crit_bonus: item.crit_bonus,
            cdr_bonus: item.cdr_bonus,
          },
        }
        GameState.instance.inventory.push(droppedItem)
      }

      return { leveled: result.character.level > oldLevel, droppedItem }
    } catch { /* best-effort */ }
    return { leveled: false, droppedItem: null }
  }
}

export function buildDungeonList(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  defs: DungeonDef[],
  charLevel: number,
  onSelect: (d: DungeonDef) => void,
): void {
  const startY = 130
  const rowH   = 72

  defs.forEach((d, i) => {
    const y      = startY + i * rowH
    const locked = charLevel < d.min_level
    const stroke = locked ? 0x444455 : 0xc45aff
    const textCol = locked ? '#555566' : '#e8e2d0'
    const subCol  = locked ? '#444455' : '#9aa8bd'

    const bg = scene.add.rectangle(W/2, y + rowH/2 - 8, 500, 60, 0x0d0a1a)
      .setStrokeStyle(2, stroke)
    overlay.add(bg)

    if (!locked) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover',  () => bg.setFillStyle(0x1a1428))
        .on('pointerout',   () => bg.setFillStyle(0x0d0a1a))
        .on('pointerdown',  () => onSelect(d))
    }

    overlay.add(scene.add.text(W/2 - 220, y + rowH/2 - 20, d.name.toUpperCase(), {
      fontFamily: FONT, fontSize: '10px', color: textCol, stroke: '#000', strokeThickness: 3,
    }))
    overlay.add(scene.add.text(W/2 - 220, y + rowH/2 + 2, `Lv.${d.min_level}+ REQUIRED  •  ${d.floors} FLOORS`, {
      fontFamily: FONT, fontSize: '7px', color: subCol, stroke: '#000', strokeThickness: 2,
    }))

    if (locked) {
      overlay.add(scene.add.text(W/2 + 130, y + rowH/2 - 8, 'LOCKED', {
        fontFamily: FONT, fontSize: '8px', color: '#443355', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5))
    }
  })
}
