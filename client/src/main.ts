import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { CharacterCreateScene } from './scenes/CharacterCreateScene'
import { LobbyScene } from './scenes/LobbyScene'
import { CharacterSheetScene } from './scenes/CharacterSheetScene'
import { ExpeditionScene } from './scenes/ExpeditionScene'
import { ZoneMapScene } from './scenes/ZoneMapScene'
import { DungeonScene } from './scenes/DungeonScene'
import { RaidScene } from './scenes/RaidScene'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#0b0a12',
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
    parent: document.body,
  },
  render: {
    resolution: window.devicePixelRatio,
    antialias: true,
  },
  scene: [
    BootScene,
    CharacterSelectScene,
    CharacterCreateScene,
    LobbyScene,
    CharacterSheetScene,
    ExpeditionScene,
    ZoneMapScene,
    DungeonScene,
    RaidScene,
  ],
})
