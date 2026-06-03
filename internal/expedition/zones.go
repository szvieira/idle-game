package expedition

var Zones = map[string]*Zone{
	"forest": {
		ID: "forest", Name: "Forest", ZoneNumber: 1, MinLevel: 1,
		LoopsPerDrop: 10,
		Rooms: []ZoneRoom{
			{XP: 8, Gold: 5, Enemies: []EnemyDef{
				{Name: "Goblin", HP: 30, Attack: 6, Defense: 5},
				{Name: "Goblin", HP: 30, Attack: 6, Defense: 5},
				{Name: "Goblin", HP: 30, Attack: 6, Defense: 5},
			}},
			{XP: 10, Gold: 6, Enemies: []EnemyDef{
				{Name: "Wolf", HP: 40, Attack: 8, Defense: 5},
				{Name: "Wolf", HP: 40, Attack: 8, Defense: 5},
				{Name: "Wolf", HP: 40, Attack: 8, Defense: 5},
			}},
			{XP: 12, Gold: 8, Enemies: []EnemyDef{
				{Name: "Goblin Archer", HP: 35, Attack: 9, Defense: 5},
				{Name: "Goblin Archer", HP: 35, Attack: 9, Defense: 5},
				{Name: "Goblin Archer", HP: 35, Attack: 9, Defense: 5},
			}},
		},
	},
	"ruins": {
		ID: "ruins", Name: "Ruins", ZoneNumber: 2, MinLevel: 10,
		LoopsPerDrop: 8,
		Rooms: []ZoneRoom{
			{XP: 20, Gold: 15, Enemies: []EnemyDef{
				{Name: "Skeleton", HP: 80, Attack: 16, Defense: 12},
				{Name: "Skeleton", HP: 80, Attack: 16, Defense: 12},
				{Name: "Skeleton", HP: 80, Attack: 16, Defense: 12},
			}},
			{XP: 25, Gold: 18, Enemies: []EnemyDef{
				{Name: "Zombie", HP: 110, Attack: 18, Defense: 15},
				{Name: "Zombie", HP: 110, Attack: 18, Defense: 15},
				{Name: "Zombie", HP: 110, Attack: 18, Defense: 15},
			}},
			{XP: 30, Gold: 22, Enemies: []EnemyDef{
				{Name: "Stone Golem", HP: 160, Attack: 22, Defense: 22},
				{Name: "Stone Golem", HP: 160, Attack: 22, Defense: 22},
				{Name: "Stone Golem", HP: 160, Attack: 22, Defense: 22},
			}},
		},
	},
	"shadow_cavern": {
		ID: "shadow_cavern", Name: "Shadow Cavern", ZoneNumber: 3, MinLevel: 18,
		LoopsPerDrop: 5,
		Rooms: []ZoneRoom{
			{XP: 45, Gold: 35, Enemies: []EnemyDef{
				{Name: "Giant Bat", HP: 180, Attack: 30, Defense: 12},
				{Name: "Giant Bat", HP: 180, Attack: 30, Defense: 12},
				{Name: "Giant Bat", HP: 180, Attack: 30, Defense: 12},
			}},
			{XP: 55, Gold: 42, Enemies: []EnemyDef{
				{Name: "Venomous Spider", HP: 200, Attack: 35, Defense: 18},
				{Name: "Venomous Spider", HP: 200, Attack: 35, Defense: 18},
				{Name: "Venomous Spider", HP: 200, Attack: 35, Defense: 18},
			}},
			{XP: 65, Gold: 50, Enemies: []EnemyDef{
				{Name: "Troll", HP: 280, Attack: 40, Defense: 22},
				{Name: "Troll", HP: 280, Attack: 40, Defense: 22},
				{Name: "Troll", HP: 280, Attack: 40, Defense: 22},
			}},
		},
	},
}

func GetZone(id string) *Zone { return Zones[id] }
