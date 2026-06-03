package expedition

import "math/rand"

var commonItems = map[string][]string{
	"Helmet": {"Leather Cap", "Cloth Hood", "Worn Helm"},
	"Armor":  {"Leather Vest", "Cloth Robe", "Worn Chestguard"},
	"Weapon": {"Wooden Sword", "Gnarled Staff", "Chipped Axe"},
}

var rareItems = map[string][]string{
	"Helmet": {"Shadow Hood", "Bone Helm", "Iron Crown"},
	"Armor":  {"Shadow Plate", "Bone Chestpiece", "Iron Cuirass"},
	"Weapon": {"Shadow Blade", "Bone Staff", "Iron Axe"},
}

func RollLoot(rng *rand.Rand, zone *Zone, completedLoops int) []CollectItem {
	count := completedLoops / zone.LoopsPerDrop
	slots := []string{"Helmet", "Armor", "Weapon"}
	var items []CollectItem
	for i := 0; i < count; i++ {
		slot := slots[rng.Intn(3)]
		item := CollectItem{Slot: slot}
		switch zone.ZoneNumber {
		case 1:
			names := commonItems[slot]
			item.Name = names[rng.Intn(len(names))]
			item.Rarity = "Common"
		case 2:
			if rng.Intn(2) == 0 {
				names := rareItems[slot]
				item.Name = names[rng.Intn(len(names))]
				item.Rarity = "Rare"
			} else {
				names := commonItems[slot]
				item.Name = names[rng.Intn(len(names))]
				item.Rarity = "Common"
			}
		case 3:
			names := rareItems[slot]
			item.Name = names[rng.Intn(len(names))]
			item.Rarity = "Rare"
		}
		items = append(items, item)
	}
	return items
}
