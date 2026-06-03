package dungeon

import "math/rand"

type Item struct {
	Name   string
	Rarity string
	Slot   string
}

func RollItem(rng *rand.Rand, isElite, isBoss bool) *Item {
	slots := []string{"Helmet", "Armor", "Weapon"}
	slot := slots[rng.Intn(3)]

	rare := map[string][]string{
		"Helmet": {"Shadow Hood", "Bone Helm", "Iron Crown"},
		"Armor":  {"Shadow Plate", "Bone Chestpiece", "Iron Cuirass"},
		"Weapon": {"Shadow Blade", "Bone Staff", "Iron Axe"},
	}
	epic := map[string][]string{
		"Helmet": {"Warlord's Helm", "Forsaken Crown", "Void Visor"},
		"Armor":  {"Warlord's Plate", "Forsaken Armor", "Void Mantle"},
		"Weapon": {"Warlord's Edge", "Forsaken Staff", "Void Blade"},
	}

	roll := rng.Intn(100)
	switch {
	case isBoss && roll < 60:
		n := epic[slot]
		return &Item{Name: n[rng.Intn(len(n))], Rarity: "Epic", Slot: slot}
	case isBoss:
		n := rare[slot]
		return &Item{Name: n[rng.Intn(len(n))], Rarity: "Rare", Slot: slot}
	case isElite && roll < 60:
		n := rare[slot]
		return &Item{Name: n[rng.Intn(len(n))], Rarity: "Rare", Slot: slot}
	}
	return nil
}
