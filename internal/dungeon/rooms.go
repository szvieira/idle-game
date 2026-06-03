package dungeon

import "game/internal/combat"

func mk(name string, hp, atk, def int) *combat.Enemy {
	return &combat.Enemy{Name: name, HP: hp, MaxHP: hp, Attack: atk, Defense: def}
}

func BuildDungeon() []Room {
	return []Room{
		{
			Name:    "Room 1 — Goblin Den",
			Enemies: []*combat.Enemy{mk("Goblin Scout", 50, 10, 10), mk("Goblin Scout", 50, 10, 10), mk("Goblin Scout", 50, 10, 10)},
			XP:      15, Gold: 10,
		},
		{
			Name:    "Room 2 — Bone Chamber",
			Enemies: []*combat.Enemy{mk("Skeleton Warrior", 50, 10, 10), mk("Skeleton Warrior", 50, 10, 10), mk("Skeleton Warrior", 50, 10, 10)},
			XP:      15, Gold: 10,
		},
		{
			Name:    "Room 3 — Archer's Perch",
			Enemies: []*combat.Enemy{mk("Dark Archer", 50, 10, 10), mk("Dark Archer", 50, 10, 10), mk("Dark Archer", 50, 10, 10)},
			XP:      15, Gold: 10,
		},
		{
			Name:    "Room 4 — Stone Hall",
			Enemies: []*combat.Enemy{mk("Stone Golem", 50, 10, 10), mk("Stone Golem", 50, 10, 10), mk("Stone Golem", 50, 10, 10)},
			XP:      15, Gold: 10,
		},
		{
			Name:    "Elite Room — Shadow Knight's Lair",
			Enemies: []*combat.Enemy{mk("Shadow Knight", 150, 20, 18)},
			XP:      50, Gold: 30, IsElite: true,
		},
		{
			Name:    "Boss Room — The Inner Sanctum",
			Enemies: []*combat.Enemy{mk("The Forsaken Warlord", 280, 25, 22)},
			XP:      150, Gold: 80, IsBoss: true,
		},
	}
}
