package combat

// NopHandler discards all combat events. Used server-side when display is not needed.
type NopHandler struct{}

func (NopHandler) OnEnemyIntro(_ string, _, _ int, _ bool)                              {}
func (NopHandler) OnPlayerAttack(_ int, _, _ bool, _, _ string, _, _, _, _ int)         {}
func (NopHandler) OnPlayerHeal(_ int, _ string, _, _ int)                               {}
func (NopHandler) OnEnemyAttack(_ int, _ bool, _ string, _, _ int)                      {}
func (NopHandler) OnEnemyDeath(_ string, _ bool)                                        {}
