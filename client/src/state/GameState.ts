import type { Character, ExpeditionRun, InventoryItem, EquippedSlots, CharacterSkills } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null
  inventory: InventoryItem[] = []
  equipped: EquippedSlots = {}
  skills: CharacterSkills = { nodes: [], unlocked: [], equipped_skill: 'whirlwind', available_points: 0 }

  static readonly instance = new GameState()
}
