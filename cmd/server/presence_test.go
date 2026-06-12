package main

import (
	"net/http"
	"testing"
)

func TestPresence_MissingCharID(t *testing.T) {
	w := do(t, "GET", "/ws/presence", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing char_id, got %d %s", w.Code, w.Body.String())
	}
}
