package character

type LevelUpHandler interface {
	OnLevelUp(class string, newLevel, maxHP, hp, attack int)
}

func CheckLevelUp(c *Character, h LevelUpHandler) {
	for c.XP >= c.XPToNext {
		c.XP -= c.XPToNext
		c.Level++
		c.XPToNext = c.XPToNext * 3 / 2
		c.MaxHP += 10
		c.HP = min(c.MaxHP, c.HP+10)
		c.Attack++
		h.OnLevelUp(c.Class, c.Level, c.MaxHP, c.HP, c.Attack)
	}
}
