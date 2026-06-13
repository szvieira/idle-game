import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { VISUAL_SLOTS } from '../combat/sprites'
import { PresenceSocket } from '../net/PresenceSocket'
import { W, H, FONT } from './BaseCombat'
import type { EquipmentSlot } from '../types/api'
import type { PlayerSnap } from '../net/PresenceSocket'

const LOBBY_ARENA = { x1: 60, y1: 335, x2: 900, y2: 520 }
const BASE = 'http://localhost:8080'

interface OtherPlayer {
  doll: PaperDollContainer
  label: Phaser.GameObjects.Text
  targetX: number
  targetY: number
}

interface LobbyMember {
  character_id: string
  name: string
  class: string
  is_leader: boolean
}

interface LobbyState {
  id: string
  invite_code: string
  status: string
  leader_character_id: string
  run_id?: string
  members: LobbyMember[]
}

interface POI {
  x: number; y: number; r: number
  label: string
  color: number
  onEnter: () => void
}

export class LobbyScene extends Phaser.Scene {
  private hero!: { x: number; y: number; speed: number; doll: PaperDollContainer; shadow: Phaser.GameObjects.Ellipse }
  private moveTo: { x: number; y: number } | null = null
  private pois: POI[] = []
  private locked = false
  private presence: PresenceSocket | null = null
  private otherPlayers: Map<string, OtherPlayer> = new Map()
  private lobbyPollInterval: ReturnType<typeof setInterval> | null = null

  constructor() { super({ key: 'Lobby' }) }

  font(size: number, color = '#e8e2d0'): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 4 }
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.pois = []
    this.locked = false
    this.moveTo = null
    this.otherPlayers.clear()

    this.buildCamp()
    this.buildHeroAvatar()
    this.buildPOIs()
    this.buildTopUI()
    this.setupInput()
    this.setupPresence()
    this.events.once('shutdown', () => this.shutdownScene())
  }

  private buildCamp(): void {
    this.add.rectangle(W/2, H/2, W, H, 0x151a26).setDepth(-10)
    const g = this.add.graphics().setDepth(-6)
    g.fillStyle(0xe8e2d0, 0.8)
    for (let i = 0; i < 40; i++)
      g.fillRect(Phaser.Math.Between(0,W), Phaser.Math.Between(0,190), 2, 2)
    g.fillStyle(0x1c2435, 1)
    g.fillTriangle(60,335,260,150,460,335)
    g.fillTriangle(380,335,600,110,860,335)
    g.fillStyle(0x232c40, 1)
    g.fillTriangle(-40,335,140,200,340,335)
    g.fillTriangle(620,335,800,190,1020,335)
    g.fillStyle(0x1b1622, 1); g.fillRect(0,335,W,H-335)
    g.fillStyle(0x232c40, 0.4)
    for (let ty=344; ty<H; ty+=44)
      for (let tx=(ty%88===0?0:44); tx<W; tx+=88)
        g.fillRect(tx,ty,42,42)
    g.fillStyle(0x2a2235,1); g.fillRect(0,335,W,8)
    g.fillStyle(0x4a3b2a,1)
    g.fillRect(W/2-17,420,34,8); g.fillRect(W/2-9,414,8,18)
    const flame = this.add.rectangle(W/2,405,18,24,0xffa726).setDepth(3)
    this.tweens.add({ targets:flame, scaleY:1.5, scaleX:0.8, alpha:0.75, duration:220, yoyo:true, repeat:-1 })

    this.add.text(W/2, 26, 'CAMP', this.font(16,'#ffd34d')).setOrigin(0.5).setDepth(20)
    const hint = this.add.text(W/2, H-12, 'CLICK TO WALK  •  APPROACH ENTRANCE TO ENTER',
      this.font(7,'#9aa8bd')).setOrigin(0.5,1).setDepth(20)
    this.tweens.add({ targets:hint, alpha:0.35, duration:1100, yoyo:true, repeat:-1 })
  }

  private buildHeroAvatar(): void {
    const doll = new PaperDollContainer(this, W/2, 472)
    doll.setDepth(3)
    for (const [slot, item] of Object.entries(GameState.instance.equipped)) {
      if (item) doll.equip(slot as EquipmentSlot, item.template.name)
    }
    this.hero = {
      x: W/2, y: 472, speed: 175, doll,
      shadow: this.add.ellipse(W/2, 504, 50, 12, 0x000000, 0.35).setDepth(1),
    }
  }

  private addPOI(poi: POI): void {
    this.pois.push(poi)
    const ring = this.add.circle(poi.x, poi.y, poi.r).setStrokeStyle(2, poi.color, 0.3).setDepth(0)
    this.tweens.add({ targets:ring, scale:1.08, alpha:0.15, duration:900, yoyo:true, repeat:-1 })
    this.add.text(poi.x, poi.y + poi.r + 14, poi.label, this.font(8, `#${poi.color.toString(16).padStart(6,'0')}`))
      .setOrigin(0.5).setDepth(20)
  }

  private buildPOIs(): void {
    this.addPOI({ x:854, y:390, r:55, color:0x5ec05e, label:'EXPEDITION',
      onEnter: () => this.scene.start('Expedition') })

    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x2a2235, 1); g.fillRect(78,244,110,98)
    g.fillStyle(0x0b0a12, 1); g.fillRect(103,270,60,72)
    g.fillStyle(0x3a2a4a, 1); g.fillTriangle(78,244,133,208,188,244)
    this.addPOI({ x:133, y:390, r:55, color:0xc45aff, label:'DUNGEON',
      onEnter: () => this.scene.start('Dungeon') })

    this.addPOI({ x:640, y:416, r:50, color:0xffd34d, label:'SHOP',
      onEnter: () => this.openShop() })

    this.addPOI({ x:382, y:390, r:50, color:0x9aa8bd, label:'CHARACTER',
      onEnter: () => this.scene.start('CharacterSheet') })

    this.addPOI({ x:510, y:365, r:45, color:0xff4d6d, label:'RAID',
      onEnter: () => this.openRaidDialog() })
  }

  private buildTopUI(): void {
    const char = GameState.instance.character!
    this.add.text(20, 14, `${char.name}  Lv.${char.level}  ${char.class}`, this.font(11)).setDepth(20)
    this.add.text(20, 34, `HP: ${char.hp}/${char.max_hp}   Gold: ${char.gold}`, this.font(9,'#aaaacc')).setDepth(20)
  }

  private setupInput(): void {
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.locked) return
      const p = _p as Phaser.Input.Pointer
      if (p.worldY < LOBBY_ARENA.y1 - 25) return
      this.moveTo = {
        x: Phaser.Math.Clamp(p.worldX, LOBBY_ARENA.x1, LOBBY_ARENA.x2),
        y: Phaser.Math.Clamp(p.worldY, LOBBY_ARENA.y1, LOBBY_ARENA.y2),
      }
      const r = this.add.circle(this.moveTo.x, this.moveTo.y, 4).setStrokeStyle(3, 0x5ec05e).setDepth(1)
      this.tweens.add({ targets:r, alpha:0, duration:350, ease:'Quad.out',
        onUpdate: () => r.setStrokeStyle(3, 0x5ec05e, Math.max(r.alpha, 0)),
        onComplete: () => r.destroy() })
    })
  }

  private setupPresence(): void {
    const char = GameState.instance.character
    if (!char) return

    this.presence = new PresenceSocket(
      char.id,
      (players) => this.onPresenceUpdate(players),
      (id) => this.onPresenceLeave(id),
    )
    this.presence.connect()
    this.presence.startBroadcast(() => ({
      x: this.hero.x,
      y: this.hero.y,
      moving: this.moveTo !== null,
      equipped: this.getOwnEquipped(),
    }))
  }

  private getOwnEquipped(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const slot of VISUAL_SLOTS) {
      const item = GameState.instance.equipped[slot as EquipmentSlot]
      if (item) result[slot] = item.template.name
    }
    return result
  }

  private shutdownScene(): void {
    this.presence?.disconnect()
    this.presence = null
    if (this.lobbyPollInterval !== null) {
      clearInterval(this.lobbyPollInterval)
      this.lobbyPollInterval = null
    }
    for (const entry of this.otherPlayers.values()) {
      entry.doll.destroy()
      entry.label.destroy()
    }
    this.otherPlayers.clear()
  }

  private applyEquippedToDoll(doll: PaperDollContainer, equipped: Record<string, string>): void {
    for (const slot of VISUAL_SLOTS) {
      doll.unequip(slot)
    }
    for (const [slot, itemName] of Object.entries(equipped)) {
      doll.equip(slot as EquipmentSlot, itemName)
    }
  }

  private onPresenceUpdate(players: PlayerSnap[]): void {
    for (const player of players) {
      if (player.id === GameState.instance.character?.id) continue

      const entry = this.otherPlayers.get(player.id)
      if (!entry) {
        const doll = new PaperDollContainer(this, player.x, player.y)
        doll.setDepth(3).setTint(0x88aaff)
        if (player.equipped) this.applyEquippedToDoll(doll, player.equipped)
        const label = this.add.text(player.x, player.y - 40, player.name, {
          fontFamily: FONT,
          fontSize: '9px',
          color: '#88aaff',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(4)
        this.otherPlayers.set(player.id, { doll, label, targetX: player.x, targetY: player.y })
      } else {
        entry.targetX = player.x
        entry.targetY = player.y
        if (player.equipped) this.applyEquippedToDoll(entry.doll, player.equipped)
      }
    }
  }

  private onPresenceLeave(id: string): void {
    const entry = this.otherPlayers.get(id)
    if (!entry) return
    entry.doll.destroy()
    entry.label.destroy()
    this.otherPlayers.delete(id)
  }

  // ── Raid dialog ──────────────────────────────────────────────────────────────

  private openRaidDialog(): void {
    const overlay = this.add.container(0, 0).setDepth(60)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.78))
    overlay.add(this.add.text(W/2, 110, 'RAID PORTAL', this.font(16, '#ff4d6d')).setOrigin(0.5))
    overlay.add(this.add.text(W/2, 148, 'The Forsaken Warlord', this.font(9, '#9aa8bd')).setOrigin(0.5))

    const makeBtn = (label: string, y: number, color: number) => {
      const bg = this.add.rectangle(W/2, y, 260, 44, 0x1a1a2e).setStrokeStyle(2, color).setInteractive({ useHandCursor: true })
      const txt = this.add.text(W/2, y, label, this.font(10, `#${color.toString(16).padStart(6,'0')}`)).setOrigin(0.5)
      overlay.add(bg); overlay.add(txt)
      return bg
    }

    makeBtn('SOLO RUN', 220, 0xff4d6d).on('pointerdown', () => {
      overlay.destroy()
      void this.startSoloRaid()
    })
    makeBtn('CREATE PARTY', 290, 0xffd34d).on('pointerdown', () => {
      overlay.destroy()
      void this.createPartyLobby()
    })
    makeBtn('JOIN PARTY', 360, 0x7fd4ff).on('pointerdown', () => {
      overlay.destroy()
      void this.joinPartyLobby()
    })

    const close = this.add.rectangle(W/2, 440, 140, 34, 0x2a2235).setStrokeStyle(1, 0x555566).setInteractive({ useHandCursor: true })
    const closeTxt = this.add.text(W/2, 440, 'CLOSE', this.font(9, '#888899')).setOrigin(0.5)
    overlay.add(close); overlay.add(closeTxt)
    close.on('pointerdown', () => {
      overlay.destroy()
      this.resetHeroToCenter()
    })
  }

  private async startSoloRaid(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: char.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { run_id: string }
      this.scene.start('Raid', { runId: data.run_id })
    } catch {
      this.locked = false
    }
  }

  private async createPartyLobby(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-lobbies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: char.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { lobby_id: string; invite_code: string }
      this.showPartyLobby(data.lobby_id, data.invite_code, true)
    } catch {
      this.locked = false
    }
  }

  private async joinPartyLobby(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.locked = false; return }
    const code = window.prompt('Enter invite code (e.g. ABCD-1234):')
    if (!code) { this.locked = false; return }
    try {
      const res = await fetch(`${BASE}/raid-lobbies/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: code.trim().toUpperCase(), character_id: char.id }),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        window.alert(err.error ?? 'Failed to join')
        this.locked = false
        return
      }
      const data = await res.json() as { lobby_id: string }
      this.showPartyLobby(data.lobby_id, code.trim().toUpperCase(), false)
    } catch {
      this.locked = false
    }
  }

  private showPartyLobby(lobbyId: string, inviteCode: string, isLeader: boolean): void {
    const char = GameState.instance.character!

    const overlay = this.add.container(0, 0).setDepth(60)
    overlay.add(this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.82))
    overlay.add(this.add.text(W/2, 90, 'PARTY LOBBY', this.font(15, '#ffd34d')).setOrigin(0.5))

    if (isLeader) {
      overlay.add(this.add.text(W/2, 132, 'INVITE CODE', this.font(8, '#9aa8bd')).setOrigin(0.5))
      overlay.add(this.add.rectangle(W/2, 165, 260, 38, 0x1a1a2e).setStrokeStyle(2, 0xffd34d))
      overlay.add(this.add.text(W/2, 165, inviteCode, this.font(14, '#ffd34d')).setOrigin(0.5))
    } else {
      overlay.add(this.add.text(W/2, 132, 'Waiting for leader to start…', this.font(8, '#9aa8bd')).setOrigin(0.5))
    }

    // Member list area
    overlay.add(this.add.text(W/2, 215, 'PARTY MEMBERS', this.font(8, '#888899')).setOrigin(0.5))
    const memberContainer = this.add.container(W/2, 240)
    overlay.add(memberContainer)

    const updateMembers = (members: LobbyMember[]) => {
      memberContainer.removeAll(true)
      members.forEach((m, i) => {
        const classColor = m.class === 'Warrior' ? '#ff9966' : m.class === 'Mage' ? '#7fd4ff' : '#88ff88'
        const leaderTag = m.is_leader ? ' ★' : ''
        const txt = this.add.text(0, i * 26, `${m.name}  [${m.class}]${leaderTag}`, this.font(8, classColor)).setOrigin(0.5)
        memberContainer.add(txt)
      })
    }

    if (isLeader) {
      const startBtn = this.add.rectangle(W/2, 390, 220, 42, 0x1f1a0e).setStrokeStyle(2, 0xffd34d).setInteractive({ useHandCursor: true })
      const startTxt = this.add.text(W/2, 390, 'START RAID', this.font(11, '#ffd34d')).setOrigin(0.5)
      overlay.add(startBtn); overlay.add(startTxt)
      startBtn.on('pointerdown', async () => {
        try {
          const res = await fetch(`${BASE}/raid-runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobby_id: lobbyId, character_id: char.id }),
          })
          if (!res.ok) throw new Error(await res.text())
          const data = await res.json() as { run_id: string }
          this.clearLobbyPoll()
          overlay.destroy()
          this.scene.start('Raid', { runId: data.run_id })
        } catch (e) {
          window.alert(`Could not start raid: ${String(e)}`)
        }
      })
    }

    const leaveBtn = this.add.rectangle(W/2, isLeader ? 448 : 390, 160, 34, 0x2a1a1e).setStrokeStyle(1, 0xff4d6d).setInteractive({ useHandCursor: true })
    const leaveTxt = this.add.text(W/2, isLeader ? 448 : 390, 'LEAVE', this.font(9, '#ff4d6d')).setOrigin(0.5)
    overlay.add(leaveBtn); overlay.add(leaveTxt)
    leaveBtn.on('pointerdown', () => {
      this.clearLobbyPoll()
      overlay.destroy()
      this.resetHeroToCenter()
    })

    // Poll lobby state every 2s
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/raid-lobbies/${lobbyId}`)
        if (!res.ok) return
        const state = await res.json() as LobbyState
        updateMembers(state.members)

        // Non-leader: join raid once leader has started it
        if (!isLeader && state.status === 'started' && state.run_id) {
          this.clearLobbyPoll()
          overlay.destroy()
          this.scene.start('Raid', { runId: state.run_id })
        }
      } catch { /* ignore poll errors */ }
    }

    void poll() // immediate first fetch
    this.lobbyPollInterval = setInterval(() => { void poll() }, 2000)
  }

  private clearLobbyPoll(): void {
    if (this.lobbyPollInterval !== null) {
      clearInterval(this.lobbyPollInterval)
      this.lobbyPollInterval = null
    }
  }

  private resetHeroToCenter(): void {
    this.hero.x = W/2
    this.hero.y = 472
    this.moveTo = null
    this.locked = false
  }

  update(_time: number, delta: number): void {
    if (!this.hero) return
    const dt = delta / 1000
    const h  = this.hero
    if (this.moveTo) {
      const d = Phaser.Math.Distance.Between(h.x, h.y, this.moveTo.x, this.moveTo.y)
      if (d > 4) {
        const step = Math.min(h.speed * dt, d)
        const dx = (this.moveTo.x - h.x) / d
        const dy = (this.moveTo.y - h.y) / d
        h.x += dx * step; h.y += dy * step
        h.doll.setFlipX(dx < 0)
      } else {
        this.moveTo = null
      }
    }
    h.x = Phaser.Math.Clamp(h.x, LOBBY_ARENA.x1, LOBBY_ARENA.x2)
    h.y = Phaser.Math.Clamp(h.y, LOBBY_ARENA.y1, LOBBY_ARENA.y2)
    h.doll.setPosition(h.x, h.y)
    h.shadow.setPosition(h.x, h.y + 32)

    // Smoothly interpolate other players toward their last-received positions
    const lerpFactor = Math.min(1, delta * 0.012)
    for (const entry of this.otherPlayers.values()) {
      const nx = entry.doll.x + (entry.targetX - entry.doll.x) * lerpFactor
      const ny = entry.doll.y + (entry.targetY - entry.doll.y) * lerpFactor
      entry.doll.setPosition(nx, ny)
      entry.label.setPosition(nx, ny - 40)
    }

    if (!this.locked) {
      for (const poi of this.pois) {
        const d = Phaser.Math.Distance.Between(h.x, h.y, poi.x, poi.y)
        if (d < poi.r - 10) {
          this.locked = true
          poi.onEnter()
          break
        }
      }
    }
  }

  private openShop(): void {
    const char = GameState.instance.character!
    const overlay = this.add.container(0,0).setDepth(60)
    overlay.add(this.add.rectangle(W/2,H/2,W,H, 0x000000, 0.75))
    overlay.add(this.add.text(W/2, 160, 'SHOP', this.font(18,'#ffd34d')).setOrigin(0.5))
    const hp = this.add.rectangle(W/2-80, 280, 200, 50, 0x1a2a1a).setStrokeStyle(1, 0x5ec05e).setInteractive({ useHandCursor:true })
    overlay.add(hp)
    overlay.add(this.add.text(W/2-80, 272, 'HP Potion', this.font(11,'#5ec05e')).setOrigin(0.5))
    overlay.add(this.add.text(W/2-80, 290, '50 Gold — +50% HP', this.font(8,'#888899')).setOrigin(0.5))
    hp.on('pointerdown', () => {
      if (char.gold < 50) return
      char.gold -= 50
      char.hp = Math.min(char.max_hp, char.hp + Math.round(char.max_hp * 0.5))
    })
    const close = this.add.rectangle(W/2, 420, 120, 36, 0x334455).setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor:true })
    overlay.add(close)
    overlay.add(this.add.text(W/2, 420, 'CLOSE', this.font(10)).setOrigin(0.5))
    close.on('pointerdown', () => {
      overlay.destroy()
      this.resetHeroToCenter()
    })
  }
}
