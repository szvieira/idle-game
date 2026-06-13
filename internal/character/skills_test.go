package character_test

import (
	"testing"

	"game/internal/character"
)

func TestApplyPassiveSkills_AtkPercent(t *testing.T) {
	c := baseWarrior() // from items_test.go — Attack: 10
	effects := []character.SkillEffect{
		{AtkPct: 10},
	}
	character.ApplyPassiveSkills(c, effects)
	if c.Attack != 11 {
		t.Errorf("Attack: got %d, want 11", c.Attack)
	}
}

func TestApplyPassiveSkills_HPPercent(t *testing.T) {
	c := baseWarrior() // MaxHP: 100
	effects := []character.SkillEffect{
		{HPPct: 15},
	}
	character.ApplyPassiveSkills(c, effects)
	if c.MaxHP != 115 {
		t.Errorf("MaxHP: got %d, want 115", c.MaxHP)
	}
	if c.HP != 115 {
		t.Errorf("HP: got %d, want 115", c.HP)
	}
}

func TestApplyPassiveSkills_Crit(t *testing.T) {
	c := baseWarrior() // Critical: 10
	effects := []character.SkillEffect{{Crit: 5}}
	character.ApplyPassiveSkills(c, effects)
	if c.Critical != 15 {
		t.Errorf("Critical: got %d, want 15", c.Critical)
	}
}

func TestApplyPassiveSkills_Def(t *testing.T) {
	c := baseWarrior() // Defense: 5
	effects := []character.SkillEffect{{Def: 4}}
	character.ApplyPassiveSkills(c, effects)
	if c.Defense != 9 {
		t.Errorf("Defense: got %d, want 9", c.Defense)
	}
}

func TestSkillPointsAvailable(t *testing.T) {
	tests := []struct {
		level         int
		unlockedCount int // includes whirlwind
		wantPoints    int
	}{
		{1, 1, 0}, // level 1, only whirlwind → 0 points
		{2, 1, 1}, // level 2, only whirlwind → 1 point
		{5, 3, 2}, // level 5, 3 nodes unlocked → 5-1-2 = 2 points
	}
	for _, tt := range tests {
		got := character.SkillPointsAvailable(tt.level, tt.unlockedCount)
		if got != tt.wantPoints {
			t.Errorf("level=%d unlocked=%d: got %d, want %d",
				tt.level, tt.unlockedCount, got, tt.wantPoints)
		}
	}
}
