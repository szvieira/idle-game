import { request } from './client'

export interface DungeonDef {
  id: string
  name: string
  min_level: number
  floors: number
}

export function getDungeons(): Promise<DungeonDef[]> {
  return request<DungeonDef[]>('GET', '/dungeon-definitions')
}
