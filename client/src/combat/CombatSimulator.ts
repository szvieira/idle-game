import type { ZoneDef } from '../types/api'

export interface CombatChar {
  hp: number
  maxHp: number
  attack: number
  defense: number
  critical: number
  class: string
  specialName: string
  specialMult: number
  specialHeal: number
  specialCd: number
}

export type CombatEvent =
  | { type: 'enemy_intro'; name: string; hp: number; maxHp: number }
  | { type: 'player_attack'; damage: number; isCrit: boolean; isSpecial: boolean; specialName: string; targetName: string; enemyHp: number; enemyMaxHp: number; playerHp: number; playerMaxHp: number }
  | { type: 'player_heal'; amount: number; specialName: string; playerHp: number; playerMaxHp: number }
  | { type: 'enemy_attack'; damage: number; isCrit: boolean; attackerName: string; playerHp: number; playerMaxHp: number }
  | { type: 'enemy_death'; name: string }
  | { type: 'room_complete'; roomIndex: number; totalRooms: number }
  | { type: 'loop_complete' }
  | { type: 'player_death' }

function calcDamage(attack: number, defense: number, critical: number): [number, boolean] {
  const variation = 0.9 + Math.random() * 0.2
  let dmg = Math.floor(attack * variation * (1 - defense / 100))
  if (dmg < 1) dmg = 1
  const isCrit = Math.floor(Math.random() * 100) < critical
  if (isCrit) dmg = Math.floor(dmg * 1.75)
  return [dmg, isCrit]
}

export function simulateLoop(charStats: CombatChar, zone: ZoneDef): CombatEvent[] {
  const events: CombatEvent[] = []
  const c = { ...charStats, hp: charStats.maxHp }
  let cdTimer = 0

  for (let roomIdx = 0; roomIdx < zone.rooms.length; roomIdx++) {
    const room = zone.rooms[roomIdx]

    for (const enemyDef of room.enemies) {
      let enemyHp = enemyDef.hp
      events.push({ type: 'enemy_intro', name: enemyDef.name, hp: enemyDef.hp, maxHp: enemyDef.hp })

      for (let tick = 1; ; tick++) {
        if (c.class === 'Priest' && c.hp < c.maxHp / 2 && cdTimer === 0) {
          let healed = c.specialHeal
          c.hp += healed
          if (c.hp > c.maxHp) {
            healed -= c.hp - c.maxHp
            c.hp = c.maxHp
          }
          cdTimer = c.specialCd
          events.push({ type: 'player_heal', amount: healed, specialName: c.specialName, playerHp: c.hp, playerMaxHp: c.maxHp })
        } else if (c.class !== 'Priest' && cdTimer === 0) {
          const [dmg, isCrit] = calcDamage(Math.floor(c.attack * c.specialMult), enemyDef.defense, c.critical)
          enemyHp -= dmg
          cdTimer = c.specialCd
          events.push({ type: 'player_attack', damage: dmg, isCrit, isSpecial: true, specialName: c.specialName, targetName: enemyDef.name, enemyHp: Math.max(0, enemyHp), enemyMaxHp: enemyDef.hp, playerHp: c.hp, playerMaxHp: c.maxHp })
        } else {
          const [dmg, isCrit] = calcDamage(c.attack, enemyDef.defense, c.critical)
          enemyHp -= dmg
          events.push({ type: 'player_attack', damage: dmg, isCrit, isSpecial: false, specialName: '', targetName: enemyDef.name, enemyHp: Math.max(0, enemyHp), enemyMaxHp: enemyDef.hp, playerHp: c.hp, playerMaxHp: c.maxHp })
        }

        if (cdTimer > 0) cdTimer--

        if (enemyHp <= 0) {
          events.push({ type: 'enemy_death', name: enemyDef.name })
          break
        }

        if (tick % 2 === 0) {
          const [eDmg, eCrit] = calcDamage(enemyDef.attack, c.defense, 5)
          c.hp -= eDmg
          if (c.hp < 0) c.hp = 0
          events.push({ type: 'enemy_attack', damage: eDmg, isCrit: eCrit, attackerName: enemyDef.name, playerHp: c.hp, playerMaxHp: c.maxHp })

          if (c.hp <= 0) {
            events.push({ type: 'player_death' })
            return events
          }
        }
      }
    }

    events.push({ type: 'room_complete', roomIndex: roomIdx, totalRooms: zone.rooms.length })
  }

  events.push({ type: 'loop_complete' })
  return events
}
