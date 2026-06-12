package character_test

import (
	"testing"

	"game/internal/character"
)

func baseWarrior() *character.Character {
	return &character.Character{
		Class: "Warrior", Level: 1,
		HP: 100, MaxHP: 100,
		Attack: 10, Defense: 5,
		Critical: 10, CDR: 0,
		XP: 0, XPToNext: 100,
		SpecialMult: 2.0, SpecialCD: 5, SpecialName: "Strike",
	}
}

func TestApplyEquipment_SumsAllBonuses(t *testing.T) {
	c := baseWarrior()
	bonuses := []character.EquippedBonus{
		{AttackBonus: 4, HPBonus: 14},
		{AttackBonus: 8, CritBonus: 2},
		{CDRBonus: 5},
	}
	character.ApplyEquipment(c, bonuses)

	if c.Attack != 22 {
		t.Errorf("Attack: got %d, want 22", c.Attack)
	}
	if c.MaxHP != 114 {
		t.Errorf("MaxHP: got %d, want 114", c.MaxHP)
	}
	if c.HP != 114 {
		t.Errorf("HP: got %d, want 114", c.HP)
	}
	if c.Critical != 12 {
		t.Errorf("Critical: got %d, want 12", c.Critical)
	}
	if c.CDR != 5 {
		t.Errorf("CDR: got %d, want 5", c.CDR)
	}
}

func TestApplyEquipment_CapsAtMaxValues(t *testing.T) {
	c := baseWarrior()
	c.Critical = 75
	c.CDR = 45
	bonuses := []character.EquippedBonus{
		{CritBonus: 10, CDRBonus: 10},
	}
	character.ApplyEquipment(c, bonuses)

	if c.Critical != 80 {
		t.Errorf("Critical cap: got %d, want 80", c.Critical)
	}
	if c.CDR != 50 {
		t.Errorf("CDR cap: got %d, want 50", c.CDR)
	}
}

func TestApplyEquipment_EmptyBonuses(t *testing.T) {
	c := baseWarrior()
	original := *c
	character.ApplyEquipment(c, nil)

	if c.Attack != original.Attack {
		t.Errorf("Attack changed with no bonuses")
	}
}
