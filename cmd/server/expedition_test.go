package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"game/internal/db"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Test setup ────────────────────────────────────────────────────────────────

var testServer *server

func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://game:game@localhost:5432/game?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		panic("connect to test DB: " + err.Error())
	}
	if err := db.Migrate(ctx, pool); err != nil {
		panic("run migrations: " + err.Error())
	}
	testServer = &server{pool: pool}
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

func do(t *testing.T, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	testServer.routes().ServeHTTP(w, req)
	return w
}

func mustJSON(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(w.Body).Decode(v); err != nil {
		t.Fatalf("decode response: %v (body: %s)", err, w.Body.String())
	}
}

func createChar(t *testing.T, class string) string {
	t.Helper()
	w := do(t, "POST", "/characters", map[string]string{"name": "Tester", "class": class})
	if w.Code != http.StatusCreated {
		t.Fatalf("create character: %d %s", w.Code, w.Body.String())
	}
	var resp struct{ ID string `json:"id"` }
	mustJSON(t, w, &resp)
	t.Cleanup(func() { cleanupChar(t, resp.ID) })
	return resp.ID
}

func cleanupChar(t *testing.T, charID string) {
	t.Helper()
	testServer.pool.Exec(context.Background(),
		`DELETE FROM characters WHERE id = $1`, charID)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestExpedition_StartIdempotent(t *testing.T) {
	charID := createChar(t, "Warrior")

	w1 := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	if w1.Code != http.StatusCreated {
		t.Fatalf("start expedition: %d %s", w1.Code, w1.Body.String())
	}
	var r1 struct{ ID string `json:"id"` }
	mustJSON(t, w1, &r1)

	w2 := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	if w2.Code != http.StatusCreated {
		t.Fatalf("second start: %d %s", w2.Code, w2.Body.String())
	}
	var r2 struct{ ID string `json:"id"` }
	mustJSON(t, w2, &r2)

	if r1.ID != r2.ID {
		t.Fatalf("idempotent start returned different run IDs: %s vs %s", r1.ID, r2.ID)
	}
}

func TestExpedition_ZoneLevelGate(t *testing.T) {
	charID := createChar(t, "Warrior") // level 10

	// shadow_cavern requires level 18
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "shadow_cavern",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for locked zone, got %d %s", w.Code, w.Body.String())
	}
}

func TestExpedition_CollectRewards(t *testing.T) {
	charID := createChar(t, "Warrior")

	// Start expedition
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("start: %d %s", w.Code, w.Body.String())
	}
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	// Force-set last_activity_at to 120 seconds ago so collect returns rewards
	testServer.pool.Exec(context.Background(), `
		UPDATE expedition_runs
		SET last_activity_at = NOW() - INTERVAL '120 seconds'
		WHERE id = $1
	`, run.ID)

	// Collect
	w2 := do(t, "POST", "/expedition-runs/"+run.ID+"/collect", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("collect: %d %s", w2.Code, w2.Body.String())
	}
	var result struct {
		CannotSurvive bool `json:"cannot_survive"`
		XPGained      int  `json:"xp_gained"`
		GoldGained    int  `json:"gold_gained"`
		Character     struct {
			XP   int `json:"xp"`
			Gold int `json:"gold"`
		} `json:"character"`
	}
	mustJSON(t, w2, &result)

	if result.CannotSurvive {
		t.Fatal("warrior should survive forest")
	}
	if result.XPGained <= 0 {
		t.Fatalf("expected XP gain from 120s expedition, got %d", result.XPGained)
	}
	if result.GoldGained <= 0 {
		t.Fatalf("expected gold gain from 120s expedition, got %d", result.GoldGained)
	}

	// Verify DB updated
	var dbXP, dbGold int
	testServer.pool.QueryRow(context.Background(),
		`SELECT xp, gold FROM characters WHERE id = $1`, charID,
	).Scan(&dbXP, &dbGold)
	if dbXP != result.Character.XP {
		t.Fatalf("DB xp=%d but response xp=%d", dbXP, result.Character.XP)
	}
	if dbGold != result.Character.Gold {
		t.Fatalf("DB gold=%d but response gold=%d", dbGold, result.Character.Gold)
	}
}

func TestExpedition_PauseTimeNotCounted(t *testing.T) {
	charID := createChar(t, "Warrior")

	// Start
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	// Backdate start by 120s so active time = 120s
	testServer.pool.Exec(context.Background(), `
		UPDATE expedition_runs
		SET last_activity_at = NOW() - INTERVAL '120 seconds'
		WHERE id = $1
	`, run.ID)

	// Pause (freezes time at ~120s)
	wp := do(t, "POST", "/expedition-runs/"+run.ID+"/pause", nil)
	if wp.Code != http.StatusOK {
		t.Fatalf("pause: %d %s", wp.Code, wp.Body.String())
	}

	// Wait a bit — this time should NOT be counted
	time.Sleep(2 * time.Second)

	// Resume
	wr := do(t, "POST", "/expedition-runs/"+run.ID+"/resume", nil)
	if wr.Code != http.StatusOK {
		t.Fatalf("resume: %d %s", wr.Code, wr.Body.String())
	}

	// Collect immediately — elapsed should be ~120s, not 122s+
	wc := do(t, "POST", "/expedition-runs/"+run.ID+"/collect", nil)
	if wc.Code != http.StatusOK {
		t.Fatalf("collect: %d %s", wc.Code, wc.Body.String())
	}
	var result struct {
		ElapsedSeconds int64 `json:"elapsed_seconds"`
	}
	mustJSON(t, wc, &result)

	// elapsed should be ~120s; allow up to 125s for test timing slop
	if result.ElapsedSeconds < 118 || result.ElapsedSeconds > 125 {
		t.Fatalf("pause time was counted: elapsed=%ds (expected ~120s)", result.ElapsedSeconds)
	}
}

func TestExpedition_PauseOnPaused_NoOp(t *testing.T) {
	charID := createChar(t, "Warrior")
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	do(t, "POST", "/expedition-runs/"+run.ID+"/pause", nil)

	w2 := do(t, "POST", "/expedition-runs/"+run.ID+"/pause", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("second pause should be no-op, got %d", w2.Code)
	}
}

func TestExpedition_CollectOnPaused_Returns400(t *testing.T) {
	charID := createChar(t, "Warrior")
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	do(t, "POST", "/expedition-runs/"+run.ID+"/pause", nil)

	wc := do(t, "POST", "/expedition-runs/"+run.ID+"/collect", nil)
	if wc.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for collect on paused run, got %d", wc.Code)
	}
}

func TestExpedition_ZoneSwitch_Atomic(t *testing.T) {
	charID := createChar(t, "Warrior") // level 10, qualifies for ruins

	// Start in forest
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	// Backdate by 120s so there are rewards to collect
	testServer.pool.Exec(context.Background(), `
		UPDATE expedition_runs
		SET last_activity_at = NOW() - INTERVAL '120 seconds'
		WHERE id = $1
	`, run.ID)

	goldBefore := charGold(t, charID)

	// Switch to ruins (auto-collects forest rewards + switches zone)
	ws := do(t, "POST", "/expedition-runs/"+run.ID+"/zone",
		map[string]string{"zone_id": "ruins"})
	if ws.Code != http.StatusOK {
		t.Fatalf("zone switch: %d %s", ws.Code, ws.Body.String())
	}
	var resp struct {
		ZoneID  string `json:"zone_id"`
		Collect struct {
			GoldGained int `json:"gold_gained"`
		} `json:"collect"`
	}
	mustJSON(t, ws, &resp)

	if resp.ZoneID != "ruins" {
		t.Fatalf("expected zone_id=ruins, got %s", resp.ZoneID)
	}

	// DB: zone updated
	var dbZone string
	testServer.pool.QueryRow(context.Background(),
		`SELECT zone_id FROM expedition_runs WHERE id = $1`, run.ID,
	).Scan(&dbZone)
	if dbZone != "ruins" {
		t.Fatalf("DB zone_id=%s expected ruins", dbZone)
	}

	// DB: gold increased (auto-collect applied)
	goldAfter := charGold(t, charID)
	if goldAfter <= goldBefore {
		t.Fatalf("gold should increase after zone switch collect: before=%d after=%d", goldBefore, goldAfter)
	}
	if resp.Collect.GoldGained != goldAfter-goldBefore {
		t.Fatalf("response GoldGained=%d but actual delta=%d", resp.Collect.GoldGained, goldAfter-goldBefore)
	}
}

func TestExpedition_ZoneSwitch_LockedZone(t *testing.T) {
	charID := createChar(t, "Warrior") // level 10
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	ws := do(t, "POST", "/expedition-runs/"+run.ID+"/zone",
		map[string]string{"zone_id": "shadow_cavern"})
	if ws.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for locked zone switch, got %d %s", ws.Code, ws.Body.String())
	}
}

func TestExpedition_ZoneSwitch_SameZone_NoOp(t *testing.T) {
	charID := createChar(t, "Warrior")
	w := do(t, "POST", "/expedition-runs", map[string]string{
		"character_id": charID, "zone_id": "forest",
	})
	var run struct{ ID string `json:"id"` }
	mustJSON(t, w, &run)

	ws := do(t, "POST", "/expedition-runs/"+run.ID+"/zone",
		map[string]string{"zone_id": "forest"})
	if ws.Code != http.StatusOK {
		t.Fatalf("same-zone switch should be no-op 200, got %d", ws.Code)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func charGold(t *testing.T, charID string) int {
	t.Helper()
	var gold int
	testServer.pool.QueryRow(context.Background(),
		`SELECT gold FROM characters WHERE id = $1`, charID,
	).Scan(&gold)
	return gold
}

// ensure pool type is usable without import lint
var _ *pgxpool.Pool = nil
