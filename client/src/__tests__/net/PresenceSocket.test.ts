import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceSocket } from '../../net/PresenceSocket'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1

  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
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
    this.onclose?.()
  }
}

describe('PresenceSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects to presence endpoint and sends position updates', () => {
    const onUpdate = vi.fn()
    const onLeave = vi.fn()
    const socket = new PresenceSocket('char-1', onUpdate, onLeave)

    socket.connect()
    socket.sendPosition(120, 340, 'walk')

    expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:8080/ws/presence?char_id=char-1')
    expect(FakeWebSocket.instances[0].sent).toEqual([
      JSON.stringify({ type: 'presence:pos', x: 120, y: 340, anim: 'walk' }),
    ])
  })

  it('forwards update and leave messages then cleans broadcast interval on disconnect', () => {
    const onUpdate = vi.fn()
    const onLeave = vi.fn()
    const socket = new PresenceSocket('char-1', onUpdate, onLeave)

    socket.connect()
    const ws = FakeWebSocket.instances[0]
    ws.onmessage?.({ data: JSON.stringify({ type: 'presence:update', players: [{ id: 'char-2', name: 'Mira', x: 10, y: 20, anim: 'idle' }] }) } as MessageEvent<string>)
    ws.onmessage?.({ data: JSON.stringify({ type: 'presence:leave', player_id: 'char-2' }) } as MessageEvent<string>)

    socket.startBroadcast(() => ({ x: 1, y: 2 }), 150)
    vi.advanceTimersByTime(300)
    socket.disconnect()
    vi.advanceTimersByTime(300)

    expect(onUpdate).toHaveBeenCalledWith([{ id: 'char-2', name: 'Mira', x: 10, y: 20, anim: 'idle' }])
    expect(onLeave).toHaveBeenCalledWith('char-2')
    expect(ws.sent).toHaveLength(2)
  })
})
