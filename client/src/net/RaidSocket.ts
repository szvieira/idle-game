import type { DamageEvent, EndMsg, StateTick } from './raid-types'

const BASE_WS = 'ws://localhost:8080'

export type { DamageEvent, EndMsg, StateTick }

export interface RaidSocketCallbacks {
  onState: (tick: StateTick) => void
  onDamage: (ev: DamageEvent) => void
  onEnd: (msg: EndMsg) => void
}

export class RaidSocket {
  private ws: WebSocket | null = null

  constructor(
    private runId: string,
    private charId: string,
    private cbs: RaidSocketCallbacks,
  ) {}

  connect(): void {
    this.ws = new WebSocket(`${BASE_WS}/ws/raid?run_id=${this.runId}&char_id=${this.charId}`)
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'raid:state') this.cbs.onState(msg)
        else if (msg.type === 'raid:damage') this.cbs.onDamage(msg)
        else if (msg.type === 'raid:end') this.cbs.onEnd(msg)
      } catch {
        // Ignore malformed raid messages.
      }
    }
  }

  sendMove(x: number, y: number): void {
    this.send({ type: 'raid:input', kind: 'move_to', x, y })
  }

  sendSkill(): void {
    this.send({ type: 'raid:input', kind: 'skill' })
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(msg: object): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(msg))
  }
}
