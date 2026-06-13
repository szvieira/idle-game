import type { CharacterSkills } from '../types/api'
import { request } from './client'

export function getSkills(characterId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('GET', `/characters/${characterId}/skills`)
}

export function unlockSkill(characterId: string, nodeId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('POST', `/characters/${characterId}/skills/${nodeId}/unlock`)
}

export function equipSkill(characterId: string, nodeId: string): Promise<CharacterSkills> {
  return request<CharacterSkills>('PUT', `/characters/${characterId}/skills/equipped`, {
    node_id: nodeId,
  })
}
