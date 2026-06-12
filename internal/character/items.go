package character

// EquippedBonus holds the stat bonuses from one equipped item.
type EquippedBonus struct {
	AttackBonus  int
	DefenseBonus int
	HPBonus      int
	CritBonus    int
	CDRBonus     int
}

// ApplyEquipment adds all item bonuses to the character in place.
// Call after base stats are set (level-up already applied).
func ApplyEquipment(c *Character, bonuses []EquippedBonus) {
	for _, b := range bonuses {
		c.Attack += b.AttackBonus
		c.Defense += b.DefenseBonus
		c.MaxHP += b.HPBonus
		c.HP += b.HPBonus
		c.Critical += b.CritBonus
		c.CDR += b.CDRBonus
	}
	if c.Critical > 80 {
		c.Critical = 80
	}
	if c.CDR > 50 {
		c.CDR = 50
	}
}
