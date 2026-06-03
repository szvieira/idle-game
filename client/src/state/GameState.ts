import type { Character, ExpeditionRun } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null

  static readonly instance = new GameState()
}
