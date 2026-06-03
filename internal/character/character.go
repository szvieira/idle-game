package character

type Character struct {
	Class         string
	Level         int
	XP, XPToNext  int
	HP, MaxHP     int
	Mana, MaxMana int
	Attack        int
	Defense       int
	Critical      int
	CDR           int

	SpecialName     string
	SpecialMult     float64
	SpecialHeal     int
	SpecialManaCost int
	SpecialCD       int
	SpecialCDTimer  int
}

func EffectiveCD(base, cdr int) int {
	cd := base * (100 - cdr) / 100
	if cd < 1 {
		return 1
	}
	return cd
}
