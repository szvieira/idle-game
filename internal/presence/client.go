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
	Class  string // character class
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte

	// Last known state (for broadcasting full state to new joiners)
	X, Y     float64
	Anim     string
	Equipped map[string]string
}

func NewClient(charID, name, class string, hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		CharID: charID, Name: name, Class: class,
		hub: hub, conn: conn,
		send: make(chan []byte, sendBuf),
	}
}

func (c *Client) Run(ctx context.Context) {
	go c.writePump(ctx)
	c.readPump(ctx)
}

func (c *Client) readPump(ctx context.Context) {
	defer func() {
		c.hub.Unregister(c.CharID)
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()
	for {
		var raw map[string]interface{}
		if err := wsjson.Read(ctx, c.conn, &raw); err != nil {
			return
		}
		if raw["type"] != "presence:pos" {
			continue
		}

		b, _ := json.Marshal(raw)
		var pos PosMsg
		if err := json.Unmarshal(b, &pos); err != nil {
			continue
		}

		c.X = pos.X
		c.Y = pos.Y
		c.Anim = pos.Anim
		if pos.Equipped != nil {
			c.Equipped = pos.Equipped
		}
		if pos.Class != "" {
			c.Class = pos.Class
		}

		// Build update message with this player's info
		out, _ := json.Marshal(UpdateMsg{
			Type: "presence:update",
			Players: []PlayerSnap{{
				ID: c.CharID, Name: c.Name, Class: c.Class,
				X: c.X, Y: c.Y, Anim: c.Anim,
				Equipped: c.Equipped,
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
			if !ok {
				return
			}
			if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
				log.Printf("ws write: %v", err)
				return
			}
		case <-ticker.C:
			// Ping to keep connection alive
			if err := c.conn.Ping(ctx); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
