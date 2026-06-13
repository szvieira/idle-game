package combat

import (
	"math/rand"

	"game/internal/character"
)

// RoomStats tracks combat statistics for one room pass.
type RoomStats struct {
	EnemiesDefeated int
	DamageDealt     int
	DamageTaken     int
	HealingReceived int
	Ticks           int
}

// RunCombat runs one character against one enemy until one of them dies.
// All events are reported via h; no I/O is performed here.
// Returns true if the character survived.
func RunCombat(c *character.Character, e *Enemy, stats *RoomStats, isBoss bool, rng *rand.Rand, h EventHandler) bool {
	h.OnEnemyIntro(e.Name, e.HP, e.MaxHP, isBoss)

	for tick := 1; ; tick++ {
		stats.Ticks++

		switch {
		case c.Class == "Paladin" && c.SpecialCDTimer == 0:
			// Holy Smite: deals moderate damage and heals self
			dmg, isCrit := CalcDamage(rng, int(float64(c.Attack)*c.SpecialMult), e.Defense, c.Critical)
			e.HP -= dmg
			healed := c.SpecialHeal
			c.HP += healed
			if c.HP > c.MaxHP {
				healed -= c.HP - c.MaxHP
				c.HP = c.MaxHP
			}
			c.SpecialCDTimer = c.SpecialCD
			stats.DamageDealt += dmg
			stats.HealingReceived += healed
			h.OnPlayerAttack(dmg, isCrit, true, c.SpecialName, e.Name, max(0, e.HP), e.MaxHP, c.HP, c.MaxHP)
			h.OnPlayerHeal(healed, c.SpecialName, c.HP, c.MaxHP)

		case c.Class != "Paladin" && c.SpecialCDTimer == 0:
			dmg, isCrit := CalcDamage(rng, int(float64(c.Attack)*c.SpecialMult), e.Defense, c.Critical)
			e.HP -= dmg
			c.SpecialCDTimer = c.SpecialCD
			stats.DamageDealt += dmg
			h.OnPlayerAttack(dmg, isCrit, true, c.SpecialName, e.Name, max(0, e.HP), e.MaxHP, c.HP, c.MaxHP)

		default:
			dmg, isCrit := CalcDamage(rng, c.Attack, e.Defense, c.Critical)
			e.HP -= dmg
			stats.DamageDealt += dmg
			h.OnPlayerAttack(dmg, isCrit, false, "", e.Name, max(0, e.HP), e.MaxHP, c.HP, c.MaxHP)
		}

		if c.SpecialCDTimer > 0 {
			c.SpecialCDTimer--
		}

		if e.HP <= 0 {
			stats.EnemiesDefeated++
			h.OnEnemyDeath(e.Name, isBoss)
			return true
		}

		if tick%2 == 0 {
			eDmg, eCrit := CalcDamage(rng, e.Attack, c.Defense, 5)
			c.HP -= eDmg
			if c.HP < 0 {
				c.HP = 0
			}
			stats.DamageTaken += eDmg
			h.OnEnemyAttack(eDmg, eCrit, e.Name, c.HP, c.MaxHP)

			if c.HP <= 0 {
				return false
			}
		}
	}
}
