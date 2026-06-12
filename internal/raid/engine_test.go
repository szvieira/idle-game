package raid

import "testing"

func TestEngine_DoesNotEndBeforePlayersJoin(t *testing.T) {
	eng := NewEngine("run-1")
	eng.SpawnBoss()

	eng.step()

	select {
	case <-eng.done:
		t.Fatal("engine ended before any players joined")
	default:
	}
}

func TestEngine_MoveInputClampsAndMovesPlayer(t *testing.T) {
	eng := NewEngine("run-1")
	eng.SpawnBoss()
	eng.AddPlayer("char-1", "Aldric", 100, 20, 5, nil)

	eng.HandleInput("char-1", InputMsg{Type: "raid:input", Kind: "move_to", X: 9999, Y: -9999})
	eng.step()

	player := eng.players["char-1"]
	if player.MoveTo == nil {
		t.Fatal("expected move target to remain after first tick")
	}
	if player.MoveTo[0] != ArenaX2 || player.MoveTo[1] != ArenaY1 {
		t.Fatalf("expected clamped target %.0f,%.0f got %.0f,%.0f", ArenaX2, ArenaY1, player.MoveTo[0], player.MoveTo[1])
	}
	if player.X <= 130 {
		t.Fatalf("expected player to move right, got x %.2f", player.X)
	}
}
