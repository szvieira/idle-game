export interface Character {
  id: string
  name: string
  class: 'Warrior' | 'Mage' | 'Priest'
  level: number
  xp: number
  xp_to_next: number
  gold: number
  hp: number
  max_hp: number
  mana: number
  max_mana: number
  attack: number
  defense: number
  critical: number
  cdr: number
}

export interface ExpeditionRun {
  id: string
  character_id: string
  zone_id: string
  zone_name: string
  status: 'active' | 'paused'
  started_at: string
  elapsed_seconds: number
}

export interface LootEntry {
  inventory_item_id: string
  name: string
  rarity: string
  slot: string
}

export interface CollectResult {
  cannot_survive: boolean
  xp_gained: number
  gold_gained: number
  levels_gained: number
  elapsed_seconds: number
  character: Character
  loot: LootEntry[]
}

export interface SwitchZoneResult {
  zone_id: string
  zone_name: string
  collect: CollectResult
}
