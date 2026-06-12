import Phaser from 'phaser'
import type { EquipmentSlot } from '../types/api'
import { VISUAL_SLOTS, overlayKey } from './sprites'

export class PaperDollContainer {
  private container: Phaser.GameObjects.Container
  private base: Phaser.GameObjects.Image
  readonly layers: Map<string, Phaser.GameObjects.Image> = new Map()

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.base = scene.add.image(0, 0, 'spr_hero')

    // Build one layer per visual slot, all hidden initially
    const layerImages: Phaser.GameObjects.Image[] = []
    let depth = 1
    for (const slot of VISUAL_SLOTS) {
      const layer = scene.add.image(0, 0, 'spr_hero')
        .setVisible(false)
        .setDepth(depth++)
      this.layers.set(slot, layer)
      layerImages.push(layer)
    }

    this.container = scene.add.container(x, y, [this.base, ...layerImages])
  }

  equip(slot: EquipmentSlot, itemName: string): void {
    const layer = this.layers.get(slot)
    if (!layer) return // Ring / Amulet — no visual layer
    const key = overlayKey(itemName)
    if (key) {
      layer.setTexture(`overlay_${key}`).setVisible(true)
    } else {
      layer.setVisible(false)
    }
  }

  unequip(slot: EquipmentSlot): void {
    this.layers.get(slot)?.setVisible(false)
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y)
    return this
  }

  setFlipX(flip: boolean): this {
    this.base.setFlipX(flip)
    this.layers.forEach(l => l.setFlipX(flip))
    return this
  }

  setDepth(depth: number): this {
    this.container.setDepth(depth)
    return this
  }

  setVisible(visible: boolean): this {
    this.container.setVisible(visible)
    return this
  }

  get x(): number { return this.container.x }
  get y(): number { return this.container.y }

  destroy(): void {
    this.container.destroy(true)
  }
}
