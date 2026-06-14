import type { DroppedItem } from '../types/api'

export interface PlayerState {
  id: string
  name: string
  class: string
  x: number
  y: number
  hp: number
  max_hp: number
  dead: boolean
}

export interface EnemyState {
  id: number
  name: string
  x: number
  y: number
  hp: number
  max_hp: number
  dead: boolean
}

export interface StateTick {
  type: 'raid:state'
  tick: number
  players: PlayerState[]
  enemies: EnemyState[]
}

export interface DamageEvent {
  type: 'raid:damage'
  target: string
  amount: number
  crit: boolean
  x: number
  y: number
}

export interface EndMsg {
  type: 'raid:end'
  outcome: 'victory' | 'defeat'
  dropped_item?: DroppedItem | null
}
