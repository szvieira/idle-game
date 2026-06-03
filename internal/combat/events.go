package combat

// EventHandler is implemented by any client that wants to observe combat.
// Methods are called synchronously so the handler can block (e.g. sleep) to
// control pacing.
type EventHandler interface {
	OnEnemyIntro(name string, hp, maxHP int, isBoss bool)
	OnPlayerAttack(damage int, isCrit, isSpecial bool, specialName, targetName string, enemyHP, enemyMaxHP, playerHP, playerMaxHP int)
	OnPlayerHeal(amount int, specialName string, playerHP, playerMaxHP int)
	OnEnemyAttack(damage int, isCrit bool, attackerName string, playerHP, playerMaxHP int)
	OnEnemyDeath(name string, isBoss bool)
}
