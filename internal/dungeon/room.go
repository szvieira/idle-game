package dungeon

import (
	"time"

	"game/internal/combat"
)

type Room struct {
	Name    string
	Enemies []*combat.Enemy
	XP      int
	Gold    int
	IsElite bool
	IsBoss  bool
}

type RoomStats struct {
	Name      string
	Combat    combat.RoomStats
	XPGained  int
	GoldEarned int
	StartTime time.Time
	Duration  time.Duration
}

type DungeonStats struct {
	Rooms     []RoomStats
	Loot      []*Item
	StartTime time.Time
	EndTime   time.Time
}

func (ds *DungeonStats) Totals() (enemies, dealt, taken, healing, xp, gold int) {
	for _, r := range ds.Rooms {
		enemies += r.Combat.EnemiesDefeated
		dealt += r.Combat.DamageDealt
		taken += r.Combat.DamageTaken
		healing += r.Combat.HealingReceived
		xp += r.XPGained
		gold += r.GoldEarned
	}
	return
}
