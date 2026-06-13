const BASE_WS = 'ws://localhost:8080'

export interface PlayerSnap {
  id: string
  name: string
  x: number
  y: number
  anim: string
}

type UpdateCallback = (players: PlayerSnap[]) => void
type LeaveCallback = (playerId: string) => void

export class PresenceSocket {
  private ws: WebSocket | null = null
  private broadcastInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private charId: string,
    private onUpdate: UpdateCallback,
    private onLeave: LeaveCallback,
  ) {}

  connect(): void {
    this.ws = new WebSocket(`${BASE_WS}/ws/presence?char_id=${this.charId}`)

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'presence:update') this.onUpdate(msg.players)
        else if (msg.type === 'presence:leave') this.onLeave(msg.player_id)
      } catch {
        // Ignore malformed presence messages.
      }
    }

    this.ws.onerror = () => {}
    this.ws.onclose = () => { this.ws = null }
  }

  sendPosition(x: number, y: number, anim = 'idle'): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'presence:pos', x, y, anim }))
  }

  startBroadcast(getPos: () => { x: number; y: number; moving?: boolean }, intervalMs = 80): void {
    this.broadcastInterval = setInterval(() => {
      const { x, y, moving } = getPos()
      this.sendPosition(x, y, moving ? 'walk' : 'idle')
    }, intervalMs)
  }

  disconnect(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval)
      this.broadcastInterval = null
    }
    this.ws?.close()
    this.ws = null
  }
}
