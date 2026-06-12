import type { Character, ExpeditionRun, InventoryItem, EquippedSlots } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null
  inventory: InventoryItem[] = []
  equipped: EquippedSlots = {}

  static readonly instance = new GameState()
}
