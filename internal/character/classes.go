package character

func NewWarrior() *Character {
	return &Character{
		Class: "Warrior", Level: 10, XP: 0, XPToNext: 100,
		HP: 280, MaxHP: 280,
		Attack: 30, Defense: 30, Critical: 5, CDR: 10,
		SpecialName: "Brutal Strike", SpecialMult: 2.2,
		SpecialCD: EffectiveCD(5, 10),
	}
}

func NewMage() *Character {
	return &Character{
		Class: "Mage", Level: 10, XP: 0, XPToNext: 100,
		HP: 140, MaxHP: 140,
		Attack: 48, Defense: 10, Critical: 15, CDR: 20,
		SpecialName: "Fireball", SpecialMult: 2.5,
		SpecialCD: EffectiveCD(4, 20),
	}
}

func NewPaladin() *Character {
	return &Character{
		Class: "Paladin", Level: 10, XP: 0, XPToNext: 100,
		HP: 260, MaxHP: 260,
		Attack: 24, Defense: 28, Critical: 5, CDR: 20,
		SpecialName: "Holy Smite", SpecialMult: 1.5, SpecialHeal: 45,
		SpecialCD: EffectiveCD(4, 20),
	}
}

func ApplyClassSkills(c *Character) {
	var tmpl *Character
	switch c.Class {
	case "Warrior":
		tmpl = NewWarrior()
	case "Mage":
		tmpl = NewMage()
	case "Paladin":
		tmpl = NewPaladin()
	default:
		return
	}
	c.SpecialName = tmpl.SpecialName
	c.SpecialMult = tmpl.SpecialMult
	c.SpecialHeal = tmpl.SpecialHeal
	c.SpecialCD   = tmpl.SpecialCD
}
