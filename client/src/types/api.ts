export interface Character {
  id: string
  name: string
  class: 'Warrior' | 'Mage' | 'Paladin'
  level: number
  xp: number
  xp_to_next: number
  gold: number
  hp: number
  max_hp: number
  attack: number
  defense: number
  critical: number
  cdr: number
  special_name: string
  special_mult: number
  special_heal: number
  special_cd: number
}

export interface EnemyDef {
  name: string
  hp: number
  attack: number
  defense: number
}

export interface ZoneRoomDef {
  xp: number
  gold: number
  enemies: EnemyDef[]
}

export interface ZoneDef {
  id: string
  name: string
  min_level: number
  rooms: ZoneRoomDef[]
}

export interface ExpeditionRun {
  id: string
  character_id: string
  zone_id: string
  zone_name: string
  status: 'active' | 'paused'
  started_at: string
  elapsed_seconds: number
  zone_def: ZoneDef
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

export interface ItemTemplate {
  id: string
  name: string
  slot: 'Helmet' | 'Armor' | 'Weapon' | 'Boots' | 'Ring' | 'Amulet'
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic'
  source: 'expedition' | 'dungeon'
  attack_bonus: number
  defense_bonus: number
  hp_bonus: number
  crit_bonus: number
  cdr_bonus: number
  class_restriction?: string | null
}

export interface InventoryItem {
  id: string
  character_id: string
  item_template_id: string
  enchant_level?: number
  template: ItemTemplate
}

export type EquipmentSlot = 'Helmet' | 'Armor' | 'Weapon' | 'Boots' | 'Ring' | 'Amulet'

export type EquippedSlots = Partial<Record<EquipmentSlot, InventoryItem>>

export interface CompleteExpeditionResult {
  character: Character
  items_added: InventoryItem[]
}

export interface SkillNode {
  id: string
  name: string
  type: 'active' | 'passive'
  requires_id: string | null
  col: number
  row: number
}

export interface CharacterSkills {
  nodes: SkillNode[]
  unlocked: string[]
  equipped_skill: string
  available_points: number
}
