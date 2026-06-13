# Presence System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time presence in LobbyScene — players broadcast position every 150ms, server relays to others in the same zone. Other players appear as sprites with interpolated movement.

**Architecture:** WebSocket hub on server (`/ws/presence`). Each connected client sends `presence:pos` messages. Server broadcasts `presence:update` to all others in same zone. Client interpolates received positions for smooth rendering.

**Dependencies:** Requires Slice 4 (LobbyScene exists). Requires adding `nhooyr.io/websocket` to Go module.

**Tech Stack:** Go 1.25, nhooyr.io/websocket, TypeScript, Phaser 3.80

---

## File Map

| Action | Path |
|---|---|
| Modify | `go.mod` / `go.sum` (add websocket dep) |
| Create | `internal/presence/hub.go` |
| Create | `internal/presence/client.go` |
| Create | `cmd/server/handler_presence.go` |
| Modify | `cmd/server/main.go` |
| Create | `client/src/net/PresenceSocket.ts` |
| Modify | `client/src/scenes/LobbyScene.ts` |

---

## Task 24: Add WebSocket dependency

**Files:**
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: Add nhooyr.io/websocket**

```bash
go get nhooyr.io/websocket@latest
```

Expected: `go.mod` and `go.sum` updated.

- [ ] **Step 2: Verify it builds**

```bash
go build ./...
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore: add nhooyr.io/websocket dependency"
```

---

## Task 25: Go — Presence hub

**Files:**
- Create: `internal/presence/hub.go`
- Create: `internal/presence/client.go`

- [ ] **Step 1: Create hub.go**

```go
// internal/presence/hub.go
package presence

import (
	"encoding/json"
	"sync"
)

// Hub manages all connected presence clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client  // keyed by character ID
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]*Client)}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c.CharID] = c
	h.mu.Unlock()
}

func (h *Hub) Unregister(charID string) {
	h.mu.Lock()
	delete(h.clients, charID)
	h.mu.Unlock()
	// Broadcast leave event to remaining clients
	msg, _ := json.Marshal(LeaveMsg{Type: "presence:leave", PlayerID: charID})
	h.broadcast(charID, msg)
}

func (h *Hub) Broadcast(senderID string, msg []byte) {
	h.broadcast(senderID, msg)
}

func (h *Hub) broadcast(senderID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, c := range h.clients {
		if id == senderID { continue }
		select {
		case c.send <- msg:
		default:
			// Drop if send buffer is full — stale client
		}
	}
}

// ── Message types ──────────────────────────────────────────────────────────

type PosMsg struct {
	Type string  `json:"type"`  // "presence:pos"
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Anim string  `json:"anim"`
}

type UpdateMsg struct {
	Type    string       `json:"type"`    // "presence:update"
	Players []PlayerSnap `json:"players"`
}

type PlayerSnap struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Anim string  `json:"anim"`
}

type LeaveMsg struct {
	Type     string `json:"type"`      // "presence:leave"
	PlayerID string `json:"player_id"`
}
```

- [ ] **Step 2: Create client.go**

```go
// internal/presence/client.go
package presence

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

const sendBuf = 32

// Client represents one connected player.
type Client struct {
	CharID string
	Name   string
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte

	// Last known position (for broadcasting full state to new joiners)
	X, Y float64
	Anim string
}

func NewClient(charID, name string, hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		CharID: charID, Name: name,
		hub: hub, conn: conn,
		send: make(chan []byte, sendBuf),
	}
}

func (c *Client) Run(ctx context.Context) {
	go c.writePump(ctx)
	c.readPump(ctx)
}

func (c *Client) readPump(ctx context.Context) {
	defer func() { c.hub.Unregister(c.CharID); c.conn.Close(websocket.StatusNormalClosure, "") }()
	for {
		var raw map[string]interface{}
		if err := wsjson.Read(ctx, c.conn, &raw); err != nil {
			return
		}
		if raw["type"] != "presence:pos" { continue }

		b, _ := json.Marshal(raw)
		var pos PosMsg
		if err := json.Unmarshal(b, &pos); err != nil { continue }

		c.X = pos.X; c.Y = pos.Y; c.Anim = pos.Anim

		// Build update message with this player's info
		out, _ := json.Marshal(UpdateMsg{
			Type: "presence:update",
			Players: []PlayerSnap{{
				ID: c.CharID, Name: c.Name,
				X: c.X, Y: c.Y, Anim: c.Anim,
			}},
		})
		c.hub.Broadcast(c.CharID, out)
	}
}

func (c *Client) writePump(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok { return }
			if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
				log.Printf("ws write: %v", err)
				return
			}
		case <-ticker.C:
			// Ping to keep connection alive
			if err := c.conn.Ping(ctx); err != nil { return }
		case <-ctx.Done():
			return
		}
	}
}
```

- [ ] **Step 3: Build**

```bash
go build ./internal/presence/...
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add internal/presence/hub.go internal/presence/client.go
git commit -m "feat(presence): add WebSocket hub and client for position broadcast"
```

---

## Task 26: Go — Presence HTTP handler and route

**Files:**
- Create: `cmd/server/handler_presence.go`
- Modify: `cmd/server/main.go`
- Modify: `cmd/server/main.go` (server struct)

- [ ] **Step 1: Add hub to server struct**

In `cmd/server/main.go`, update the `server` struct and `main()`:

```go
import "game/internal/presence"

type server struct {
    pool *pgxpool.Pool
    hub  *presence.Hub
}

// In main(), update server init:
s := &server{pool: pool, hub: presence.NewHub()}
```

- [ ] **Step 2: Create handler_presence.go**

```go
// cmd/server/handler_presence.go
package main

import (
	"errors"
	"log"
	"net/http"

	"game/internal/presence"

	"github.com/jackc/pgx/v5"
	"nhooyr.io/websocket"
)

func (s *server) handlePresence(w http.ResponseWriter, r *http.Request) {
	charID := r.URL.Query().Get("char_id")
	if charID == "" {
		writeError(w, http.StatusBadRequest, "char_id required")
		return
	}

	// Load character name for display to other players
	var name string
	err := s.pool.QueryRow(r.Context(), `SELECT name FROM characters WHERE id = $1`, charID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("presence load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load character")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,  // allow all origins in dev
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}

	client := presence.NewClient(charID, name, s.hub, conn)
	s.hub.Register(client)
	client.Run(r.Context())
}
```

- [ ] **Step 3: Register route**

In `cmd/server/main.go` `routes()`, add:

```go
mux.HandleFunc("GET /ws/presence", s.handlePresence)
```

- [ ] **Step 4: Build**

```bash
go build ./cmd/server/...
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add cmd/server/handler_presence.go cmd/server/main.go
git commit -m "feat(server): add GET /ws/presence WebSocket endpoint"
```

---

## Task 27: Client — PresenceSocket and LobbyScene integration

**Files:**
- Create: `client/src/net/PresenceSocket.ts`
- Modify: `client/src/scenes/LobbyScene.ts`

- [ ] **Step 1: Create PresenceSocket.ts**

```typescript
// client/src/net/PresenceSocket.ts

const BASE_WS = 'ws://localhost:8080'

export interface PlayerSnap {
  id:   string
  name: string
  x:    number
  y:    number
  anim: string
}

type UpdateCallback = (players: PlayerSnap[]) => void
type LeaveCallback  = (playerId: string) => void

export class PresenceSocket {
  private ws: WebSocket | null = null
  private broadcastInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private charId: string,
    private onUpdate: UpdateCallback,
    private onLeave:  LeaveCallback,
  ) {}

  connect(): void {
    this.ws = new WebSocket(`${BASE_WS}/ws/presence?char_id=${this.charId}`)

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'presence:update') this.onUpdate(msg.players)
        else if (msg.type === 'presence:leave') this.onLeave(msg.player_id)
      } catch { /* ignore malformed */ }
    }

    this.ws.onerror = () => { /* silently reconnect later */ }
    this.ws.onclose = () => { this.ws = null }
  }

  sendPosition(x: number, y: number, anim = 'idle'): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'presence:pos', x, y, anim }))
  }

  startBroadcast(getPos: () => { x: number; y: number }, intervalMs = 150): void {
    this.broadcastInterval = setInterval(() => {
      const { x, y } = getPos()
      this.sendPosition(x, y)
    }, intervalMs)
  }

  disconnect(): void {
    if (this.broadcastInterval) { clearInterval(this.broadcastInterval); this.broadcastInterval = null }
    this.ws?.close()
    this.ws = null
  }
}
```

- [ ] **Step 2: Update LobbyScene to use PresenceSocket**

Add presence integration to `LobbyScene.ts`. In `create()`, after `this.buildPOIs()`, add:

```typescript
import { PresenceSocket } from '../net/PresenceSocket'
import type { PlayerSnap } from '../net/PresenceSocket'

// (inside class LobbyScene)
private presence: PresenceSocket | null = null
private otherPlayers: Map<string, { sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }> = new Map()
```

In `create()`, after building POIs:

```typescript
const char = GameState.instance.character!
this.presence = new PresenceSocket(
  char.id,
  (players) => this.onPresenceUpdate(players),
  (id)      => this.onPresenceLeave(id),
)
this.presence.connect()
this.presence.startBroadcast(() => ({ x: this.hero.x, y: this.hero.y }))
```

Add shutdown in scene `shutdown` event:

```typescript
this.events.on('shutdown', () => this.presence?.disconnect())
```

Add methods:

```typescript
private onPresenceUpdate(players: PlayerSnap[]): void {
  for (const p of players) {
    if (p.id === GameState.instance.character?.id) continue
    let entry = this.otherPlayers.get(p.id)
    if (!entry) {
      const sprite = this.add.image(p.x, p.y, 'spr_hero').setDepth(3).setTint(0x88aaff)
      const label  = this.add.text(p.x, p.y - 40, p.name, {
        font: '9px monospace', color: '#88aaff',
      }).setOrigin(0.5).setDepth(4)
      entry = { sprite, label }
      this.otherPlayers.set(p.id, entry)
    }
    // Tween to new position for smooth interpolation
    this.tweens.add({ targets: entry.sprite, x: p.x, y: p.y, duration: 150, ease: 'Linear' })
    entry.label.setPosition(p.x, p.y - 40)
  }
}

private onPresenceLeave(id: string): void {
  const entry = this.otherPlayers.get(id)
  if (entry) {
    entry.sprite.destroy()
    entry.label.destroy()
    this.otherPlayers.delete(id)
  }
}
```

- [ ] **Step 3: Build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke test**

Open two browser tabs pointing to the game. Log in as two different characters. Navigate both to Lobby. Verify each player's avatar appears in the other tab's lobby and moves when you click.

- [ ] **Step 5: Commit**

```bash
git add client/src/net/PresenceSocket.ts client/src/scenes/LobbyScene.ts
git commit -m "feat(client): add presence socket — other players visible in lobby"
```

---

## Slice 5 Complete ✓

- Server WebSocket hub at `GET /ws/presence`
- Position messages broadcast every 150ms to all players in lobby
- Other players rendered as blue-tinted sprites in LobbyScene
- Interpolated movement (150ms tween) for smooth appearance
- Clean disconnect on scene shutdown

**Next:** [Slice 6 — Raids](2026-06-12-v6-slice6-raids.md)
