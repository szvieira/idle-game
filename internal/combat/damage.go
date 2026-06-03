package combat

import "math/rand"

func CalcDamage(rng *rand.Rand, attack, defense, critical int) (dmg int, isCrit bool) {
	variation := 0.9 + rng.Float64()*0.2
	dmg = int(float64(attack) * variation * (1.0 - float64(defense)/100.0))
	if dmg < 1 {
		dmg = 1
	}
	isCrit = rng.Intn(100) < critical
	if isCrit {
		dmg = int(float64(dmg) * 1.75)
	}
	return
}
