package expedition

import "time"

const TickDuration = 500 * time.Millisecond

type Zone struct {
	ID           string
	Name         string
	ZoneNumber   int
	MinLevel     int
	Rooms        []ZoneRoom
	LoopsPerDrop int
}

type ZoneRoom struct {
	Enemies []EnemyDef
	XP      int
	Gold    int
}

type EnemyDef struct {
	Name    string
	HP      int
	Attack  int
	Defense int
}

type LoopResult struct {
	Survived bool
	Ticks    int
	XP       int
	Gold     int
}

type CollectResult struct {
	XPGained       int
	GoldGained     int
	LevelsGained   int
	NewLevel       int
	NewXP          int
	NewXPToNext    int
	NewMaxHP       int
	NewHP          int
	NewAttack      int
	NewGold        int
	Items          []CollectItem
	ElapsedSeconds int64
	CannotSurvive  bool
}

type CollectItem struct {
	TemplateID string
	Name       string
	Rarity     string
	Slot       string
}
