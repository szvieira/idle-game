package raid

type InputMsg struct {
	Type   string  `json:"type"`
	CharID string  `json:"char_id"`
	Kind   string  `json:"kind"`
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
}

type StateTick struct {
	Type    string        `json:"type"`
	Tick    int           `json:"tick"`
	Players []PlayerState `json:"players"`
	Enemies []EnemyState  `json:"enemies"`
}

type PlayerState struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Class string  `json:"class"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	HP    int     `json:"hp"`
	MaxHP int     `json:"max_hp"`
	Dead  bool    `json:"dead"`
}

type EnemyState struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	HP    int     `json:"hp"`
	MaxHP int     `json:"max_hp"`
	Dead  bool    `json:"dead"`
}

type StartMsg struct {
	Type    string        `json:"type"`
	RaidID  string        `json:"raid_id"`
	Players []PlayerState `json:"players"`
}

type EndMsg struct {
	Type    string `json:"type"`
	Outcome string `json:"outcome"`
}

type DamageEvent struct {
	Type   string  `json:"type"`
	Target string  `json:"target"`
	Amount int     `json:"amount"`
	Crit   bool    `json:"crit"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
}
