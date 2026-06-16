package raid

import (
	"context"
	"encoding/json"
	"math"
	"math/rand"
	"strconv"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

const (
	TickRate = 20
	TickMs   = 1000 / TickRate
	TickDur  = time.Duration(TickMs) * time.Millisecond
	ArenaX1  = 50.0
	ArenaX2  = 910.0
	ArenaY1  = 215.0
	ArenaY2  = 500.0
)

type enginePlayer struct {
	ID    string
	Name  string
	Class string
	X, Y  float64
	HP    int
	MaxHP int
	ATK   int
	DEF   int
	Speed float64
	Dead  bool

	MoveTo    *[2]float64
	SkillReq  bool
	NextAtk   time.Time
	NextSkill time.Time
	send      chan []byte
}

type engineEnemy struct {
	ID    int
	Name  string
	X, Y  float64
	HP    int
	MaxHP int
	ATK   int
	Speed float64
	Dead  bool

	NextAtk time.Time
}

type Engine struct {
	mu      sync.Mutex
	raidID  string
	players map[string]*enginePlayer
	enemies []*engineEnemy
	tick    int
	done    chan struct{}
	endOnce sync.Once
	rng     *rand.Rand
	outcome string
}

func NewEngine(raidID string) *Engine {
	return &Engine{
		raidID:  raidID,
		players: make(map[string]*enginePlayer),
		done:    make(chan struct{}),
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (eng *Engine) AddPlayer(id, name string, hp, atk, def int, class string, _ *websocket.Conn) {
	eng.mu.Lock()
	defer eng.mu.Unlock()

	eng.players[id] = &enginePlayer{
		ID: id, Name: name, Class: class,
		X: 130, Y: float64(360 + len(eng.players)*40),
		HP: hp, MaxHP: hp, ATK: atk, DEF: def, Speed: 175,
		send: make(chan []byte, 64),
	}
}

func (eng *Engine) SpawnBoss() {
	eng.mu.Lock()
	defer eng.mu.Unlock()

	eng.enemies = []*engineEnemy{{
		ID: 1, Name: "Crypt Warlord",
		X: 750, Y: 350,
		HP: 800, MaxHP: 800,
		ATK: 25, Speed: 60,
		NextAtk: time.Now().Add(2 * time.Second),
	}}
}

func (eng *Engine) HandleInput(charID string, msg InputMsg) {
	eng.mu.Lock()
	defer eng.mu.Unlock()

	p, ok := eng.players[charID]
	if !ok || p.Dead {
		return
	}

	switch msg.Kind {
	case "move_to":
		t := [2]float64{clamp(msg.X, ArenaX1, ArenaX2), clamp(msg.Y, ArenaY1, ArenaY2)}
		p.MoveTo = &t
	case "skill":
		p.SkillReq = true
	}
}

func (eng *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(TickDur)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-eng.done:
			return
		case <-ticker.C:
			eng.step()
		}
	}
}

func (eng *Engine) SendChan(charID string) <-chan []byte {
	eng.mu.Lock()
	defer eng.mu.Unlock()

	if p, ok := eng.players[charID]; ok {
		return p.send
	}
	return nil
}

func (eng *Engine) step() {
	eng.mu.Lock()
	defer eng.mu.Unlock()

	now := time.Now()
	dt := float64(TickMs) / 1000.0
	eng.tick++

	for _, p := range eng.players {
		if p.Dead {
			continue
		}
		if p.MoveTo != nil {
			tx, ty := p.MoveTo[0], p.MoveTo[1]
			if moved := eng.moveToward(&p.X, &p.Y, tx, ty, p.Speed, dt); !moved {
				p.MoveTo = nil
			}
		}
		if now.After(p.NextAtk) {
			for _, e := range eng.enemies {
				if e.Dead {
					continue
				}
				if dist(p.X, p.Y, e.X, e.Y) <= 80 {
					dmg := max(1, int(float64(p.ATK)*(0.85+eng.rng.Float64()*0.3)))
					e.HP -= dmg
					if e.HP <= 0 {
						e.HP = 0
						e.Dead = true
					}
					p.NextAtk = now.Add(1200 * time.Millisecond)
					eng.broadcastDamage("enemy:"+strconv.Itoa(e.ID), e.X, e.Y, dmg, false)
					break
				}
			}
		}
		if p.SkillReq && now.After(p.NextSkill) {
			p.SkillReq = false
			for _, e := range eng.enemies {
				if e.Dead {
					continue
				}
				dmg := int(float64(p.ATK) * 2.2)
				e.HP -= dmg
				if e.HP <= 0 {
					e.HP = 0
					e.Dead = true
				}
				p.NextSkill = now.Add(6 * time.Second)
				eng.broadcastDamage("enemy:"+strconv.Itoa(e.ID), e.X, e.Y, dmg, true)
				break
			}
		}
	}

	for _, e := range eng.enemies {
		if e.Dead {
			continue
		}
		nearest, nd := eng.nearestPlayer(e.X, e.Y)
		if nearest == nil {
			continue
		}
		if nd > 80 {
			eng.moveToward(&e.X, &e.Y, nearest.X, nearest.Y, e.Speed, dt)
		} else if now.After(e.NextAtk) {
			dmg := max(1, int(float64(e.ATK)*(0.85+eng.rng.Float64()*0.3))-nearest.DEF)
			nearest.HP -= dmg
			if nearest.HP <= 0 {
				nearest.HP = 0
				nearest.Dead = true
			}
			e.NextAtk = now.Add(2 * time.Second)
			eng.broadcastDamage(nearest.ID, nearest.X, nearest.Y, dmg, false)
		}
		e.X = clamp(e.X, ArenaX1, ArenaX2)
		e.Y = clamp(e.Y, ArenaY1, ArenaY2)
	}

	eng.broadcastState()
	eng.checkEnd()
}

func (eng *Engine) broadcastState() {
	ps := make([]PlayerState, 0, len(eng.players))
	for _, p := range eng.players {
		ps = append(ps, PlayerState{ID: p.ID, Name: p.Name, Class: p.Class, X: p.X, Y: p.Y, HP: p.HP, MaxHP: p.MaxHP, Dead: p.Dead})
	}
	es := make([]EnemyState, 0, len(eng.enemies))
	for _, e := range eng.enemies {
		es = append(es, EnemyState{ID: e.ID, Name: e.Name, X: e.X, Y: e.Y, HP: e.HP, MaxHP: e.MaxHP, Dead: e.Dead})
	}
	msg, _ := json.Marshal(StateTick{Type: "raid:state", Tick: eng.tick, Players: ps, Enemies: es})
	eng.sendAll(msg)
}

func (eng *Engine) broadcastDamage(target string, x, y float64, amount int, crit bool) {
	msg, _ := json.Marshal(DamageEvent{Type: "raid:damage", Target: target, Amount: amount, Crit: crit, X: x, Y: y})
	eng.sendAll(msg)
}

func (eng *Engine) checkEnd() {
	if len(eng.enemies) == 0 {
		return
	}

	allEnemiesDead := true
	for _, e := range eng.enemies {
		if !e.Dead {
			allEnemiesDead = false
			break
		}
	}
	if allEnemiesDead {
		eng.end("victory")
		return
	}

	if len(eng.players) == 0 {
		return
	}
	allPlayersDead := true
	for _, p := range eng.players {
		if !p.Dead {
			allPlayersDead = false
			break
		}
	}
	if allPlayersDead {
		eng.end("defeat")
	}
}

func (eng *Engine) end(outcome string) {
	eng.endOnce.Do(func() {
		eng.outcome = outcome
		for _, p := range eng.players {
			close(p.send)
		}
		close(eng.done)
	})
}

func (eng *Engine) Outcome() string {
	return eng.outcome
}

// Done returns a channel that is closed when the engine stops.
func (eng *Engine) Done() <-chan struct{} {
	return eng.done
}

// RemovePlayer marks a player as dead (e.g. on WebSocket disconnect) so that
// checkEnd can fire a defeat and stop the engine goroutine.
func (eng *Engine) RemovePlayer(charID string) {
	eng.mu.Lock()
	defer eng.mu.Unlock()
	if p, ok := eng.players[charID]; ok {
		p.Dead = true
	}
}

func (eng *Engine) sendAll(msg []byte) {
	for _, p := range eng.players {
		select {
		case p.send <- msg:
		default:
		}
	}
}

func dist(x1, y1, x2, y2 float64) float64 {
	return math.Sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1))
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (eng *Engine) moveToward(x, y *float64, tx, ty, speed, dt float64) bool {
	d := dist(*x, *y, tx, ty)
	if d < 2 {
		return false
	}
	step := math.Min(speed*dt, d)
	*x += (tx - *x) / d * step
	*y += (ty - *y) / d * step
	return true
}

func (eng *Engine) nearestPlayer(x, y float64) (*enginePlayer, float64) {
	var best *enginePlayer
	bd := math.MaxFloat64
	for _, p := range eng.players {
		if p.Dead {
			continue
		}
		d := dist(x, y, p.X, p.Y)
		if d < bd {
			bd = d
			best = p
		}
	}
	return best, bd
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
