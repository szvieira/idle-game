package expedition_test

import (
	"math/rand"
	"testing"

	"game/internal/character"
	"game/internal/expedition"
)

func warrior() *character.Character {
	c := character.NewWarrior()
	character.ApplyClassSkills(c)
	return c
}

func weakChar() *character.Character {
	c := &character.Character{
		Class: "Warrior", Level: 1,
		HP: 5, MaxHP: 5,
		Mana: 0, MaxMana: 0,
		Attack: 1, Defense: 0, Critical: 0, CDR: 0,
		XP: 0, XPToNext: 100,
		SpecialMult: 2.0, SpecialManaCost: 999, SpecialCD: 5, SpecialName: "Strike",
	}
	return c
}

func rng() *rand.Rand { return rand.New(rand.NewSource(42)) }

// ── Zero elapsed ──────────────────────────────────────────────────────────────

func TestCalculate_ZeroElapsed(t *testing.T) {
	c := warrior()
	clone := *c
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 0, rng())

	if result.XPGained != 0 || result.GoldGained != 0 || result.LevelsGained != 0 {
		t.Fatalf("expected zero rewards for zero elapsed, got xp=%d gold=%d levels=%d",
			result.XPGained, result.GoldGained, result.LevelsGained)
	}
	if result.CannotSurvive {
		t.Fatal("warrior should survive forest")
	}
	if len(result.Items) != 0 {
		t.Fatalf("expected no items for zero elapsed, got %d", len(result.Items))
	}
}

// ── Basic rewards ─────────────────────────────────────────────────────────────

func TestCalculate_BasicRewards(t *testing.T) {
	c := warrior()
	clone := *c
	// 120 seconds: enough for multiple forest loops
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 120, rng())

	if result.CannotSurvive {
		t.Fatal("warrior should survive forest")
	}
	if result.XPGained <= 0 {
		t.Fatalf("expected positive XP, got %d", result.XPGained)
	}
	if result.GoldGained <= 0 {
		t.Fatalf("expected positive gold, got %d", result.GoldGained)
	}
	if result.NewGold != result.GoldGained {
		t.Fatalf("NewGold=%d but GoldGained=%d with starting gold=0", result.NewGold, result.GoldGained)
	}
	if result.NewLevel < c.Level {
		t.Fatalf("level regressed: %d -> %d", c.Level, result.NewLevel)
	}
	if result.NewAttack < c.Attack {
		t.Fatalf("attack regressed: %d -> %d", c.Attack, result.NewAttack)
	}
	if result.NewMaxHP < c.MaxHP {
		t.Fatalf("max_hp regressed: %d -> %d", c.MaxHP, result.NewMaxHP)
	}
}

// ── Cannot survive ────────────────────────────────────────────────────────────

func TestCalculate_CannotSurvive(t *testing.T) {
	c := weakChar()
	clone := *c
	result := expedition.Calculate(&clone, c.XP, 100, expedition.GetZone("shadow_cavern"), 3600, rng())

	if !result.CannotSurvive {
		t.Fatal("expected CannotSurvive for 1-HP warrior in Shadow Cavern")
	}
	if result.XPGained != 0 || result.GoldGained != 0 {
		t.Fatalf("expected no rewards when cannot survive, got xp=%d gold=%d",
			result.XPGained, result.GoldGained)
	}
	if result.NewGold != 100 {
		t.Fatalf("gold should be unchanged at 100, got %d", result.NewGold)
	}
	if result.NewLevel != c.Level {
		t.Fatalf("level should not change on cannot-survive, got %d", result.NewLevel)
	}
}

// ── Level-up ──────────────────────────────────────────────────────────────────

func TestCalculate_LevelUp(t *testing.T) {
	c := warrior()
	c.XP = 80 // 20 XP short of level-up; forest loop gives 30 XP
	clone := *c
	// 120 seconds: easily covers multiple forest loops
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 120, rng())

	if result.LevelsGained <= 0 {
		t.Fatalf("expected at least one level-up, LevelsGained=%d XPGained=%d",
			result.LevelsGained, result.XPGained)
	}
	if result.NewLevel != c.Level+result.LevelsGained {
		t.Fatalf("NewLevel=%d but Level=%d + LevelsGained=%d", result.NewLevel, c.Level, result.LevelsGained)
	}
	// Each level gives +1 attack
	if result.NewAttack != c.Attack+result.LevelsGained {
		t.Fatalf("NewAttack=%d expected %d", result.NewAttack, c.Attack+result.LevelsGained)
	}
	// Each level gives +10 MaxHP
	if result.NewMaxHP != c.MaxHP+result.LevelsGained*10 {
		t.Fatalf("NewMaxHP=%d expected %d", result.NewMaxHP, c.MaxHP+result.LevelsGained*10)
	}
}

// ── Levels gained invariant ───────────────────────────────────────────────────

func TestCalculate_LevelsGainedMatchesDelta(t *testing.T) {
	c := warrior()
	clone := *c
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 600, rng())

	if result.NewLevel-c.Level != result.LevelsGained {
		t.Fatalf("LevelsGained=%d but level delta=%d", result.LevelsGained, result.NewLevel-c.Level)
	}
}

// ── Gold starting value preserved ────────────────────────────────────────────

func TestCalculate_GoldAccumulates(t *testing.T) {
	c := warrior()
	clone := *c
	startingGold := 500
	result := expedition.Calculate(&clone, c.XP, startingGold, expedition.GetZone("forest"), 120, rng())

	if result.NewGold != startingGold+result.GoldGained {
		t.Fatalf("NewGold=%d but startingGold=%d + GoldGained=%d", result.NewGold, startingGold, result.GoldGained)
	}
}

// ── Loot drops after enough loops ────────────────────────────────────────────

func TestCalculate_LootAfterEnoughLoops(t *testing.T) {
	c := warrior()
	// Forest LoopsPerDrop=10; need ≥10 loops
	// One loop ~10s; 10 loops ~100s → use 200s to be safe
	clone := *c
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 200, rng())

	if len(result.Items) == 0 {
		t.Log("no loot in 200s — loop may be slower than expected, trying 600s")
		clone2 := *c
		result2 := expedition.Calculate(&clone2, c.XP, 0, expedition.GetZone("forest"), 600, rng())
		if len(result2.Items) == 0 {
			t.Fatal("expected loot after 600s (≥10 loops) in forest, got none")
		}
	}
	for _, item := range result.Items {
		if item.Rarity != "Common" {
			t.Fatalf("forest should drop Common only, got %s", item.Rarity)
		}
	}
}

// ── Zone 2 loot rarity ────────────────────────────────────────────────────────

func TestCalculate_RuinsDropsCommonAndRare(t *testing.T) {
	c := warrior()
	clone := *c
	// Ruins LoopsPerDrop=8; 800s should give many drops
	result := expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("ruins"), 800, rng())

	if len(result.Items) == 0 {
		t.Fatal("expected loot from ruins after 800s")
	}
	rarities := map[string]int{}
	for _, item := range result.Items {
		rarities[item.Rarity]++
		if item.Rarity != "Common" && item.Rarity != "Rare" {
			t.Fatalf("ruins should drop Common or Rare, got %s", item.Rarity)
		}
	}
	t.Logf("ruins loot rarities: %v", rarities)
}

// ── Original character not mutated ───────────────────────────────────────────

func TestCalculate_OriginalUnchanged(t *testing.T) {
	c := warrior()
	originalLevel := c.Level
	originalXP := c.XP
	originalAttack := c.Attack
	originalHP := c.HP

	clone := *c
	expedition.Calculate(&clone, c.XP, 0, expedition.GetZone("forest"), 300, rng())

	if c.Level != originalLevel || c.XP != originalXP || c.Attack != originalAttack || c.HP != originalHP {
		t.Fatal("Calculate mutated the original character — must only mutate the clone")
	}
}
