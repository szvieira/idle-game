package expedition

import (
	"math/rand"

	"game/internal/character"
	"game/internal/combat"
)

func cloneChar(c *character.Character) character.Character {
	return *c
}

// benchmarkAttempt simulates one full zone loop on c (must be a clone).
// Resets HP to MaxHP at entry. Returns ticks consumed and rewards earned.
// Survived=false means character died before completing all rooms.
func benchmarkAttempt(c *character.Character, zone *Zone, rng *rand.Rand) LoopResult {
	c.HP = c.MaxHP
	result := LoopResult{Survived: true}
	h := combat.NopHandler{}
	for _, room := range zone.Rooms {
		for _, edef := range room.Enemies {
			e := &combat.Enemy{
				Name: edef.Name, HP: edef.HP, MaxHP: edef.HP,
				Attack: edef.Attack, Defense: edef.Defense,
			}
			var rs combat.RoomStats
			survived := combat.RunCombat(c, e, &rs, false, rng, h)
			result.Ticks += rs.Ticks
			if !survived {
				result.Survived = false
				return result
			}
		}
		result.XP += room.XP
		result.Gold += room.Gold
	}
	return result
}

// Calculate computes rewards for elapsedSeconds of expedition in zone.
// c must be a CLONE of the character — this function mutates it freely.
// originalXP is the character's XP before cloning, used to compute XPGained.
func Calculate(c *character.Character, originalXP, gold int, zone *Zone, elapsedSeconds int64, rng *rand.Rand) CollectResult {
	result := CollectResult{ElapsedSeconds: elapsedSeconds}
	remaining := float64(elapsedSeconds)
	tickSecs := TickDuration.Seconds()
	totalCompletedLoops := 0

	// Probe to detect cannot-survive before main loop
	probe := cloneChar(c)
	initial := benchmarkAttempt(&probe, zone, rng)
	if !initial.Survived {
		result.CannotSurvive = true
		result.NewLevel = c.Level
		result.NewXP = c.XP
		result.NewXPToNext = c.XPToNext
		result.NewMaxHP = c.MaxHP
		result.NewHP = c.HP
		result.NewAttack = c.Attack
		result.NewGold = gold
		return result
	}

	for remaining > 0 {
		attempt := benchmarkAttempt(c, zone, rng)
		loopSecs := float64(attempt.Ticks) * tickSecs
		if loopSecs <= 0 {
			break
		}

		if !attempt.Survived {
			failedAttempts := int(remaining / loopSecs)
			if failedAttempts == 0 {
				break
			}
			remaining -= float64(failedAttempts) * loopSecs
			continue
		}

		completedLoops := int(remaining / loopSecs)
		if completedLoops == 0 {
			break
		}

		totalCompletedLoops += completedLoops
		result.GoldGained += attempt.Gold * completedLoops
		remaining -= float64(completedLoops) * loopSecs

		prevLevel := c.Level
		c.XP += attempt.XP * completedLoops
		character.CheckLevelUp(c, character.NopLevelUpHandler{})
		if c.Level > prevLevel {
			result.LevelsGained += c.Level - prevLevel
		} else {
			break
		}
	}

	result.XPGained = c.XP - originalXP
	result.NewLevel = c.Level
	result.NewXP = c.XP
	result.NewXPToNext = c.XPToNext
	result.NewMaxHP = c.MaxHP
	result.NewHP = c.HP
	result.NewAttack = c.Attack
	result.NewGold = gold + result.GoldGained
	result.Items = RollLoot(rng, zone, totalCompletedLoops)

	return result
}
