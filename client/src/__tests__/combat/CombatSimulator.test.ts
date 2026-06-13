import { describe, it, expect } from 'vitest'
import { simulateLoop } from '../../combat/CombatSimulator'
import type { CombatChar } from '../../combat/CombatSimulator'
import type { ZoneDef } from '../../types/api'

const strongWarrior: CombatChar = {
  hp: 1000, maxHp: 1000,
  attack: 200, defense: 50, critical: 0, class: 'Warrior',
  specialName: 'Brutal Strike', specialMult: 2.2, specialHeal: 0, specialCd: 5,
}

const weakChar: CombatChar = {
  hp: 5, maxHp: 5,
  attack: 1, defense: 0, critical: 0, class: 'Warrior',
  specialName: 'Brutal Strike', specialMult: 2.2, specialHeal: 0, specialCd: 5,
}

const oneEnemyZone: ZoneDef = {
  id: 'test', name: 'Test', min_level: 1,
  rooms: [{ xp: 10, gold: 5, enemies: [{ name: 'Goblin', hp: 30, attack: 3, defense: 0 }] }],
}

const twoRoomZone: ZoneDef = {
  id: 'test2', name: 'Test2', min_level: 1,
  rooms: [
    { xp: 10, gold: 5, enemies: [{ name: 'Goblin', hp: 5, attack: 1, defense: 0 }] },
    { xp: 15, gold: 8, enemies: [{ name: 'Wolf',   hp: 5, attack: 1, defense: 0 }] },
  ],
}

describe('simulateLoop', () => {
  it('first event is enemy_intro', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    expect(events[0]).toEqual({ type: 'enemy_intro', name: 'Goblin', hp: 30, maxHp: 30 })
  })

  it('last event is loop_complete when character survives', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    expect(events[events.length - 1]).toEqual({ type: 'loop_complete' })
  })

  it('last event is player_death when character cannot survive', () => {
    const events = simulateLoop(weakChar, oneEnemyZone)
    expect(events[events.length - 1]).toEqual({ type: 'player_death' })
  })

  it('enemy_death appears before room_complete', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const deathIdx = events.findIndex(e => e.type === 'enemy_death')
    const roomIdx  = events.findIndex(e => e.type === 'room_complete')
    expect(deathIdx).toBeGreaterThanOrEqual(0)
    expect(roomIdx).toBeGreaterThan(deathIdx)
  })

  it('emits room_complete once per room', () => {
    const events = simulateLoop(strongWarrior, twoRoomZone)
    const completions = events.filter(e => e.type === 'room_complete')
    expect(completions).toHaveLength(2)
  })

  it('player_attack enemyHp is never negative', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    for (const e of events) {
      if (e.type === 'player_attack') expect(e.enemyHp).toBeGreaterThanOrEqual(0)
    }
  })

  it('enemy_attack playerHp is never negative', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    for (const e of events) {
      if (e.type === 'enemy_attack') expect(e.playerHp).toBeGreaterThanOrEqual(0)
    }
  })

  it('special fires on first tick (cdTimer starts at 0)', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const first = events.find(e => e.type === 'player_attack')
    expect(first).toBeDefined()
    if (first?.type === 'player_attack') expect(first.isSpecial).toBe(true)
  })

  it('second player_attack is not special (cdTimer > 0)', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const attacks = events.filter(e => e.type === 'player_attack')
    if (attacks.length >= 2 && attacks[1].type === 'player_attack') {
      expect(attacks[1].isSpecial).toBe(false)
    }
  })

  it('Priest emits player_heal when HP below half', () => {
    const priest: CombatChar = {
      hp: 100, maxHp: 100,
      attack: 10, defense: 0, critical: 0, class: 'Priest',
      specialName: 'Heal', specialMult: 1, specialHeal: 30, specialCd: 3,
    }
    const damagingZone: ZoneDef = {
      id: 'test', name: 'Test', min_level: 1,
      rooms: [{ xp: 10, gold: 5, enemies: [{ name: 'Goblin', hp: 500, attack: 40, defense: 0 }] }],
    }
    const events = simulateLoop(priest, damagingZone)
    const heals = events.filter(e => e.type === 'player_heal')
    expect(heals.length).toBeGreaterThan(0)
  })

  it('no events after loop_complete', () => {
    const events = simulateLoop(strongWarrior, oneEnemyZone)
    const idx = events.findIndex(e => e.type === 'loop_complete')
    expect(idx).toBe(events.length - 1)
  })
})
