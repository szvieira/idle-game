package main

import (
	"net/http"
	"testing"
)

func TestRaidStartFromCharacterCreatesRun(t *testing.T) {
	charID := createChar(t, "Warrior")

	w := do(t, "POST", "/raid-runs", map[string]string{"character_id": charID})
	if w.Code != http.StatusCreated {
		t.Fatalf("start raid: expected 201, got %d %s", w.Code, w.Body.String())
	}

	var resp struct {
		RunID string `json:"run_id"`
	}
	mustJSON(t, w, &resp)
	if resp.RunID == "" {
		t.Fatal("expected run_id")
	}
}

func TestRaidWSMissingParams(t *testing.T) {
	w := do(t, "GET", "/ws/raid", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing params, got %d %s", w.Code, w.Body.String())
	}
}
