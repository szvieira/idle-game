import Phaser from 'phaser'
import { W, H, FONT } from './BaseCombat'
import { GameState } from '../state/GameState'

interface ZoneDef {
  id: string
  name: string
  minLevel: number
  zoneNum: number
  color: number
  x: number
  y: number
  enemies: string
}

const ZONE_DEFS: ZoneDef[] = [
  { id: 'forest',        name: 'Forest',        minLevel: 1,  zoneNum: 1, color: 0x5ec05e, x: 190, y: 370, enemies: 'Goblins · Wolves' },
  { id: 'ruins',         name: 'Ruins',         minLevel: 10, zoneNum: 2, color: 0xcc8844, x: 480, y: 250, enemies: 'Skeletons · Golems' },
  { id: 'shadow_cavern', name: 'Shadow Cavern', minLevel: 18, zoneNum: 3, color: 0x9966cc, x: 770, y: 370, enemies: 'Giant Bats · Trolls' },
]

function font(size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3 }
}

export class ZoneMapScene extends Phaser.Scene {
  constructor() { super({ key: 'ZoneMap' }) }

  create(): void {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.add.rectangle(W/2, H/2, W, H, 0x0a1520)
    this.drawTerrain()
    this.drawPaths()
    this.drawZones(char.level)
    this.drawTitle()
    this.drawBackButton()
  }

  private drawTerrain(): void {
    const g = this.add.graphics()
    g.fillStyle(0x0d1e10, 1)
    g.fillEllipse(200, 420, 320, 120)
    g.fillStyle(0x1a1a12, 1)
    g.fillEllipse(480, 300, 260, 100)
    g.fillStyle(0x110d1a, 1)
    g.fillEllipse(770, 420, 280, 110)
  }

  private drawPaths(): void {
    const g = this.add.graphics()
    g.lineStyle(4, 0x6b5a3a, 0.7)
    g.beginPath()
    g.moveTo(ZONE_DEFS[0].x, ZONE_DEFS[0].y)
    g.lineTo(320, 310)
    g.lineTo(ZONE_DEFS[1].x, ZONE_DEFS[1].y)
    g.strokePath()
    g.beginPath()
    g.moveTo(ZONE_DEFS[1].x, ZONE_DEFS[1].y)
    g.lineTo(630, 310)
    g.lineTo(ZONE_DEFS[2].x, ZONE_DEFS[2].y)
    g.strokePath()
  }

  private drawZones(charLevel: number): void {
    const ttBg   = this.add.rectangle(0, 0, 220, 56, 0x0a1520).setStrokeStyle(1, 0x446655).setOrigin(0).setVisible(false)
    const ttName = this.add.text(10, 8,  '', font(9, '#ffffff')).setOrigin(0).setVisible(false)
    const ttInfo = this.add.text(10, 28, '', font(6, '#aabbcc')).setOrigin(0).setVisible(false)
    const hideTooltip = () => { ttBg.setVisible(false); ttName.setVisible(false); ttInfo.setVisible(false) }

    ZONE_DEFS.forEach(zone => {
      const unlocked = charLevel >= zone.minLevel
      const col   = unlocked ? zone.color : 0x444455
      const alpha = unlocked ? 1 : 0.45

      const ring = this.add.circle(zone.x, zone.y, 38, col, 0.15)
        .setStrokeStyle(2, col, alpha)
      if (unlocked) {
        this.tweens.add({ targets: ring, alpha: 0.04, scale: 1.15, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      }

      const circle = this.add.circle(zone.x, zone.y, 28, col, unlocked ? 0.9 : 0.3)
        .setStrokeStyle(3, col, alpha)

      this.add.text(zone.x, zone.y + 46, zone.name.toUpperCase(),
        font(7, unlocked ? `#${zone.color.toString(16).padStart(6,'0')}` : '#555566')).setOrigin(0.5)

      this.add.text(zone.x, zone.y + 62, `Lv. ${zone.minLevel}+`,
        font(6, unlocked ? '#aabbcc' : '#444455')).setOrigin(0.5)

      if (!unlocked) {
        this.add.text(zone.x, zone.y, '🔒', { fontSize: '16px' }).setOrigin(0.5)
      }

      if (unlocked) {
        circle.setInteractive({ useHandCursor: true })

        circle.on('pointerover', () => {
          ttName.setText(zone.name)
          ttInfo.setText(`${zone.enemies}  •  Lv. ${zone.minLevel}+`)
          const tx = zone.x + 36 < 700 ? zone.x + 36 : zone.x - 260
          ttBg.setPosition(tx, zone.y - 30)
          ttName.setPosition(tx + 10, zone.y - 22)
          ttInfo.setPosition(tx + 10, zone.y - 4)
          ttBg.setVisible(true); ttName.setVisible(true); ttInfo.setVisible(true)
        })

        circle.on('pointerout', hideTooltip)

        circle.on('pointerdown', () => {
          hideTooltip()
          this.scene.start('Expedition', { zoneId: zone.id })
        })
      }
    })

    this.children.bringToTop(ttBg)
    this.children.bringToTop(ttName)
    this.children.bringToTop(ttInfo)
  }

  private drawTitle(): void {
    this.add.text(W/2, 28, 'EXPEDITION MAP', font(14, '#ffd34d')).setOrigin(0.5)
    this.add.text(W/2, 52, 'Choose your zone', font(7, '#9aa8bd')).setOrigin(0.5)
  }

  private drawBackButton(): void {
    const btn = this.add.rectangle(W/2, H - 30, 160, 32, 0x1a1a2e)
      .setStrokeStyle(1, 0x555566)
      .setInteractive({ useHandCursor: true })
    this.add.text(W/2, H - 30, 'BACK TO CAMP', font(7, '#888899')).setOrigin(0.5)
    btn.on('pointerdown', () => this.scene.start('Lobby'))
  }
}
