import { request } from './client'
import type { DungeonRunResult, ClaimDungeonRunResult } from '../types/api'

export interface DungeonDef {
  id: string
  name: string
  min_level: number
  floors: number
  enemy_hp_mult: number
  enemy_atk_mult: number
  gold_mult: number
  loot_rarities: string[]
}

export function getDungeons(): Promise<DungeonDef[]> {
  return request<DungeonDef[]>('GET', '/dungeon-definitions')
}

export function createDungeonRun(dungeonDefinitionId: string, characterId: string): Promise<DungeonRunResult> {
  return request<DungeonRunResult>('POST', '/dungeon-runs', {
    dungeon_definition_id: dungeonDefinitionId,
    participants: [characterId],
  })
}

export function claimDungeonRun(runId: string, characterId: string): Promise<ClaimDungeonRunResult> {
  return request<ClaimDungeonRunResult>('POST', `/dungeon-runs/${runId}/claim`, { character_id: characterId })
}
