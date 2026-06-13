package character

import "encoding/json"

// SkillEffect holds the passive bonuses granted by a skill node.
// Values are stored as integers; atk_pct and hp_pct are whole percentages.
type SkillEffect struct {
	AtkPct int `json:"atk_pct,omitempty"`
	HPPct  int `json:"hp_pct,omitempty"`
	Crit   int `json:"crit,omitempty"`
	Def    int `json:"def,omitempty"`
	CDR    int `json:"cdr,omitempty"`
}

// Scan implements pgx scanning for JSONB columns.
func (e *SkillEffect) Scan(src any) error {
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, e)
	case string:
		return json.Unmarshal([]byte(v), e)
	default:
		return nil
	}
}

// ApplyPassiveSkills applies all passive node effects to the character in place.
// Call after ApplyEquipment so both bonuses are stacked correctly.
func ApplyPassiveSkills(c *Character, effects []SkillEffect) {
	for _, e := range effects {
		if e.AtkPct > 0 {
			c.Attack = c.Attack * (100 + e.AtkPct) / 100
		}
		if e.HPPct > 0 {
			bonus := c.MaxHP * e.HPPct / 100
			c.MaxHP += bonus
			c.HP += bonus
		}
		c.Critical += e.Crit
		c.Defense += e.Def
		c.CDR += e.CDR
	}
	if c.Critical > 80 {
		c.Critical = 80
	}
	if c.CDR > 50 {
		c.CDR = 50
	}
}

// SkillPointsAvailable returns how many skill points the character has to spend.
// unlockedCount includes the free starting node (whirlwind).
func SkillPointsAvailable(level, unlockedCount int) int {
	points := (level - 1) - (unlockedCount - 1)
	if points < 0 {
		return 0
	}
	return points
}
