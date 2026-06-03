import type { ExpeditionRun, CollectResult, SwitchZoneResult } from '../types/api'
import { request } from './client'

export async function startExpedition(characterId: string, zoneId: string): Promise<ExpeditionRun> {
  return request<ExpeditionRun>('POST', '/expedition-runs', {
    character_id: characterId,
    zone_id: zoneId,
  })
}

export async function getExpedition(id: string): Promise<ExpeditionRun> {
  return request<ExpeditionRun>('GET', `/expedition-runs/${id}`)
}

export async function collectExpedition(id: string): Promise<CollectResult> {
  return request<CollectResult>('POST', `/expedition-runs/${id}/collect`)
}

export async function pauseExpedition(id: string): Promise<void> {
  await request<unknown>('POST', `/expedition-runs/${id}/pause`)
}

export async function resumeExpedition(id: string): Promise<void> {
  await request<unknown>('POST', `/expedition-runs/${id}/resume`)
}

export async function switchZone(id: string, zoneId: string): Promise<SwitchZoneResult> {
  return request<SwitchZoneResult>('POST', `/expedition-runs/${id}/zone`, { zone_id: zoneId })
}
