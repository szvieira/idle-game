import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RaidSocket } from '../../net/RaidSocket'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1

  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  readyState = FakeWebSocket.OPEN
  sent: string[] = []

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }
}

describe('RaidSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects and sends raid inputs', () => {
    const socket = new RaidSocket('run-1', 'char-1', {
      onState: vi.fn(),
      onDamage: vi.fn(),
      onEnd: vi.fn(),
    })

    socket.connect()
    socket.sendMove(100, 200)
    socket.sendSkill()

    expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:8080/ws/raid?run_id=run-1&char_id=char-1')
    expect(FakeWebSocket.instances[0].sent).toEqual([
      JSON.stringify({ type: 'raid:input', kind: 'move_to', x: 100, y: 200 }),
      JSON.stringify({ type: 'raid:input', kind: 'skill' }),
    ])
  })

  it('routes state damage and end messages', () => {
    const onState = vi.fn()
    const onDamage = vi.fn()
    const onEnd = vi.fn()
    const socket = new RaidSocket('run-1', 'char-1', { onState, onDamage, onEnd })

    socket.connect()
    const ws = FakeWebSocket.instances[0]
    const state = { type: 'raid:state', tick: 1, players: [], enemies: [] }
    const damage = { type: 'raid:damage', target: 'enemy:1', amount: 10, crit: false, x: 1, y: 2 }
    const end = { type: 'raid:end', outcome: 'victory' }
    ws.onmessage?.({ data: JSON.stringify(state) } as MessageEvent<string>)
    ws.onmessage?.({ data: JSON.stringify(damage) } as MessageEvent<string>)
    ws.onmessage?.({ data: JSON.stringify(end) } as MessageEvent<string>)

    expect(onState).toHaveBeenCalledWith(state)
    expect(onDamage).toHaveBeenCalledWith(damage)
    expect(onEnd).toHaveBeenCalledWith(end)
  })
})
