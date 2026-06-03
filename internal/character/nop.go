package character

type NopLevelUpHandler struct{}

func (NopLevelUpHandler) OnLevelUp(_ string, _, _, _, _ int) {}
