package character

func NewWarrior() *Character {
	return &Character{
		Class: "Warrior", Level: 10, XP: 0, XPToNext: 100,
		HP: 280, MaxHP: 280, Mana: 120, MaxMana: 120,
		Attack: 30, Defense: 30, Critical: 5, CDR: 10,
		SpecialName: "Brutal Strike", SpecialMult: 2.2,
		SpecialManaCost: 30, SpecialCD: EffectiveCD(5, 10),
	}
}

func NewMage() *Character {
	return &Character{
		Class: "Mage", Level: 10, XP: 0, XPToNext: 100,
		HP: 140, MaxHP: 140, Mana: 180, MaxMana: 180,
		Attack: 48, Defense: 10, Critical: 15, CDR: 20,
		SpecialName: "Fireball", SpecialMult: 2.5,
		SpecialManaCost: 40, SpecialCD: EffectiveCD(4, 20),
	}
}

func NewPriest() *Character {
	return &Character{
		Class: "Priest", Level: 10, XP: 0, XPToNext: 100,
		HP: 200, MaxHP: 200, Mana: 160, MaxMana: 160,
		Attack: 18, Defense: 20, Critical: 5, CDR: 30,
		SpecialName: "Heal", SpecialHeal: 55,
		SpecialManaCost: 35, SpecialCD: EffectiveCD(3, 30),
	}
}

// ApplyClassSkills restores combat skill fields from the class template.
// Call after loading a character from the database.
func ApplyClassSkills(c *Character) {
	var tmpl *Character
	switch c.Class {
	case "Warrior":
		tmpl = NewWarrior()
	case "Mage":
		tmpl = NewMage()
	case "Priest":
		tmpl = NewPriest()
	default:
		return
	}
	c.SpecialName = tmpl.SpecialName
	c.SpecialMult = tmpl.SpecialMult
	c.SpecialHeal = tmpl.SpecialHeal
	c.SpecialManaCost = tmpl.SpecialManaCost
	c.SpecialCD = tmpl.SpecialCD
}
