package presence

import (
	"encoding/json"
	"sync"
)

// Hub manages all connected presence clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // keyed by character ID
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
		if id == senderID {
			continue
		}
		select {
		case c.send <- msg:
		default:
			// Drop if send buffer is full — stale client
		}
	}
}

// ── Message types ──────────────────────────────────────────────────────────

type PosMsg struct {
	Type string  `json:"type"` // "presence:pos"
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Anim string  `json:"anim"`
}

type UpdateMsg struct {
	Type    string       `json:"type"` // "presence:update"
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
	Type     string `json:"type"` // "presence:leave"
	PlayerID string `json:"player_id"`
}
