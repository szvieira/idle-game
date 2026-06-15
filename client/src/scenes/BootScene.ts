import Phaser from 'phaser'
import { getCharacters } from '../api/characters'
import { ALL_SPRITES, OVERLAYS, PX } from '../combat/sprites'
import type { SpriteDef } from '../combat/sprites'

function buildTexture(scene: Phaser.Scene, key: string, def: SpriteDef): void {
  if (scene.textures.exists(key)) return
  const cols = def.rows[0].length
  const rows = def.rows.length
  const tex = scene.textures.createCanvas(key, cols * PX, rows * PX)
  if (!tex) return
  const ctx = tex.getContext()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = def.rows[y][x]
      if (ch === '.' || !def.pal[ch]) continue
      ctx.fillStyle = def.pal[ch]
      ctx.fillRect(x * PX, y * PX, PX, PX)
    }
  }
  tex.refresh()
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  async create(): Promise<void> {
    // Bake base sprites
    for (const [key, def] of Object.entries(ALL_SPRITES)) {
      buildTexture(this, `spr_${key}`, def)
    }

    // Bake equipment overlays
    for (const [name, def] of Object.entries(OVERLAYS)) {
      if (def) buildTexture(this, `overlay_${name}`, def)
    }

    try {
      const characters = await getCharacters()
      if (characters.length === 0) {
        this.scene.start('CharacterCreate')
      } else {
        this.scene.start('CharacterSelect')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, {
        fontFamily: '"Exo 2", sans-serif', fontSize: '16px',
        color: '#ff4444',
      })
    }
  }
}
