import Phaser from 'phaser'
import { getCharacters } from '../api/characters'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  async create(): Promise<void> {
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
        font: '16px monospace',
        color: '#ff4444',
      })
    }
  }
}
