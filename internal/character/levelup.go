package character

type LevelUpHandler interface {
	OnLevelUp(class string, newLevel, maxHP, hp, attack int)
}

func CheckLevelUp(c *Character, h LevelUpHandler) {
	for c.XP >= c.XPToNext {
		c.XP -= c.XPToNext
		c.Level++
		c.XPToNext = c.XPToNext * 3 / 2

		switch c.Class {
		case "Warrior":
			c.MaxHP += 12
			c.HP = min(c.MaxHP, c.HP+12)
			c.Attack += 2
		case "Mage":
			c.MaxHP += 8
			c.HP = min(c.MaxHP, c.HP+8)
			c.Attack += 3
		case "Paladin":
			c.MaxHP += 15
			c.HP = min(c.MaxHP, c.HP+15)
			c.Attack++
			c.Defense++
		default:
			c.MaxHP += 10
			c.HP = min(c.MaxHP, c.HP+10)
			c.Attack++
		}
		h.OnLevelUp(c.Class, c.Level, c.MaxHP, c.HP, c.Attack)
	}
}
