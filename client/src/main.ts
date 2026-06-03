import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { CharacterCreateScene } from './scenes/CharacterCreateScene'
import { HubScene } from './scenes/HubScene'
import { CharacterSheetScene } from './scenes/CharacterSheetScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#111111',
  dom: { createContainer: true },
  scene: [BootScene, CharacterSelectScene, CharacterCreateScene, HubScene, CharacterSheetScene],
})
