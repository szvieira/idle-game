import type { InventoryItem, EquippedSlots, Character, EquipmentSlot, CompleteExpeditionResult } from '../types/api'
import { request } from './client'

export function getInventory(characterId: string): Promise<InventoryItem[]> {
  return request<InventoryItem[]>('GET', `/characters/${characterId}/inventory`)
}

export function getEquipped(characterId: string): Promise<EquippedSlots> {
  return request<EquippedSlots>('GET', `/characters/${characterId}/equipped`)
}

export function equipItem(characterId: string, slot: EquipmentSlot, inventoryItemId: string): Promise<Character> {
  return request<Character>('POST', `/characters/${characterId}/equipment/${slot}`, {
    inventory_item_id: inventoryItemId,
  })
}

export function unequipItem(characterId: string, slot: EquipmentSlot): Promise<Character> {
  return request<Character>('DELETE', `/characters/${characterId}/equipment/${slot}`)
}

export function completeExpedition(runId: string, xp: number, gold: number, items: string[]): Promise<CompleteExpeditionResult> {
  return request<CompleteExpeditionResult>('POST', `/expedition-runs/${runId}/complete`, { xp, gold, items })
}
