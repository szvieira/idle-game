import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { CharacterCreateScene } from './scenes/CharacterCreateScene'
import { LobbyScene } from './scenes/LobbyScene'
import { CharacterSheetScene } from './scenes/CharacterSheetScene'
import { ExpeditionScene } from './scenes/ExpeditionScene'
import { DungeonScene } from './scenes/DungeonScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#0b0a12',
  parent: document.body,
  dom: { createContainer: true },
  scene: [
    BootScene,
    CharacterSelectScene,
    CharacterCreateScene,
    LobbyScene,
    CharacterSheetScene,
    ExpeditionScene,
    DungeonScene,
  ],
})
