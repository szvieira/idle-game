import { request } from './client'

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
