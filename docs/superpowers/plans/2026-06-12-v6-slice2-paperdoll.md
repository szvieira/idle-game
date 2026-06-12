# Paper Doll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `PaperDollContainer` — a Phaser component that renders the hero base sprite with separate per-slot equipment overlay layers. Works in combat scenes and CharacterSheet.

**Architecture:** Pixel art grid definitions in `sprites.ts` → textures baked once in `BootScene` → `PaperDollContainer` wraps hero + 4 visual layers in a `Phaser.GameObjects.Container`. Equipping/unequipping swaps layer textures.

**Dependencies:** Requires Slice 1 (InventoryItem type, EquipmentSlot type).

**Tech Stack:** TypeScript, Phaser 3.80, Vitest

---

## File Map

| Action | Path |
|---|---|
| Create | `client/src/combat/sprites.ts` |
| Create | `client/src/combat/PaperDollContainer.ts` |
| Create | `client/src/__tests__/combat/PaperDollContainer.test.ts` |
| Modify | `client/src/scenes/BootScene.ts` |

---

## Task 9: sprites.ts — Pixel art definitions

**Files:**
- Create: `client/src/combat/sprites.ts`

- [ ] **Step 1: Create the file**

```typescript
// client/src/combat/sprites.ts
// Pixel art grids ported from the v6 prototype.
// Each row is a string; each char maps to a color in the palette.
// '.' = transparent.

export interface SpriteDef {
  pal: Record<string, string>
  rows: string[]
}

export const PX = 5  // pixels per grid cell

// ── Hero base (12×14) ────────────────────────────────────────────────────────
export const HERO_SPRITE: SpriteDef = {
  pal: { R:'#d04848',H:'#9aa8bd',D:'#5b6678',S:'#e8b890',E:'#1c2030',
         A:'#7d8ca3',B:'#3e4a5e',L:'#4a3b2a',G:'#c8b04a' },
  rows: [
    '....RR......','...HHHH.....','..HHHHHH....','..HSSSSH....',
    '..HSESES....','...SSSS.....','..AAAAAA....','.AAAAAAAA...',
    '.A.AAAA.A...','.B.AAAA.B...','...AAAA.....','...LLLL.....',
    '..LL..LL....','..BB..BB....',
  ],
}

// ── Enemies ──────────────────────────────────────────────────────────────────
export const SLIME_SPRITE: SpriteDef = {
  pal: { G:'#5ec05e',g:'#3f8f43',W:'#ffffff',B:'#1c2030' },
  rows: [
    '............','...GGGGG....','..GGGGGGG...','.GGWGGGWGG..',
    '.GGBGGGBGG..','GGGGGGGGGGG.','GGGGGgGGGGG.','gGGGGGGGGGg.',
    '.ggGGGGGgg..','..ggggggg...',
  ],
}

export const BAT_SPRITE: SpriteDef = {
  pal: { P:'#8c5fc0',p:'#5d3f86',W:'#ffd34d',B:'#1c2030',F:'#e8e8e8' },
  rows: [
    '.P..........P.','.PP........PP.','.PPP.pppp.PPP.','.PPPpppppPPPP.',
    '..PPpWppWpPP..','...ppBppBpp...','....pppppp....','....pF..Fp....',
    '.....p..p.....',
  ],
}

export const SKELETON_SPRITE: SpriteDef = {
  pal: { W:'#e6e2d0',w:'#b8b29a',B:'#1c2030',R:'#c03a3a' },
  rows: [
    '...WWWW.....','..WWWWWW....','..WBWWBW....','..WWWWWW....',
    '...WwwW.....','....WW......','..WWWWWW..R.','.W.WWWW.W.R.',
    'w..WWWW..wR.','...WwwW...R.','...W..W.....','...W..W.....',
    '..WW..WW....',
  ],
}

export const BOSS_SPRITE: SpriteDef = {
  pal: { D:'#7a2030',d:'#561522',H:'#e6e2d0',Y:'#ffd34d',R:'#ff5a4d',B:'#1c2030' },
  rows: [
    '.H..........H.','.HH........HH.','..DDDDDDDDDD..','.DDDDDDDDDDDD.',
    '.DDYDDDDDDYDD.','.DDDDDDDDDDDD.','..DdRRRRRRdD..','..DDDDDDDDDD..',
    '.DDDDDDDDDDDD.','DDDDDDDDDDDDDD','DDdDDDDDDDDdDD','...DDDDDDDD...',
    '...DDD..DDD...','..DDD....DDD..',
  ],
}

// ── Equipment overlays (12×14, aligned to hero) ───────────────────────────────
// Ring and Amulet have no visual overlay.

export const OVERLAYS: Partial<Record<string, SpriteDef>> = {
  // Weapons
  'Iron Sword': {
    pal: { B:'#c8ccd4',G:'#8a6a3a',H:'#5a3a22' },
    rows: [
      '............','............','..........B.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  "Soldier's Sword": {
    pal: { B:'#d4d9e0',G:'#5ec05e',H:'#5a3a22' },
    rows: [
      '............','............','..........B.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  'Crypt Blade': {
    pal: { B:'#b06aff',W:'#e8d0ff',G:'#3a3144',H:'#241c2e' },
    rows: [
      '............','............','..........W.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  'Profane Axe': {
    pal: { R:'#a03a3a',r:'#6e2020',B:'#3a3144',H:'#241c2e' },
    rows: [
      '............','........RR..','.......RRRB.','........rRB.',
      '..........B.','..........B.','..........B.','..........B.',
      '..........B.','..........H.','............','............',
      '............','............',
    ],
  },
  // Helmets
  "Scout's Helm": {
    pal: { F:'#7a8a5a',f:'#5a6a42' },
    rows: [
      '....FF......','...FFFF.....','..FFFFFF....','..F....F....',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  "Watcher's Helm": {
    pal: { F:'#4d7ea8',f:'#35597a' },
    rows: [
      '....FF......','...FFFF.....','..FFFFFF....','..Ff..fF....',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  'Crown of Bones': {
    pal: { W:'#e6e2d0',Y:'#ffd34d' },
    rows: [
      '..W.YY.W....','..WWWWWW....','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  // Chest
  'Leather Chestplate': {
    pal: { C:'#7a5a36',c:'#5a4226' },
    rows: [
      '............','............','............','............',
      '............','............','..CCCCCC....','.CCCcCCCC...',
      '.C.CCCC.C...','...CCCC.....','...CcCC.....','............',
      '............','............',
    ],
  },
  "Crypt Lord's Mantle": {
    pal: { D:'#7a2030',d:'#561522',G:'#ffd34d' },
    rows: [
      '............','............','............','............',
      '............','............','.DDDDDDDD...','.DDDGGDDD...',
      '.D.DDDD.D...','...DDDD.....','...DdDD.....','............',
      '............','............',
    ],
  },
  // Boots
  'Leather Boots': {
    pal: { C:'#7a5a36' },
    rows: [
      '............','............','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '............','..CC..CC....',
    ],
  },
  'Silent Boots': {
    pal: { P:'#5d3f86',p:'#3e2a5c' },
    rows: [
      '............','............','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '..PP..PP....','..pp..pp....',
    ],
  },
}

// Maps slot name → which overlay key to use for a given item name
export function overlayKey(itemName: string): string | null {
  return OVERLAYS[itemName] ? itemName : null
}

// Slots that have visual overlays (Ring and Amulet are stat-only)
export const VISUAL_SLOTS = ['Weapon', 'Helmet', 'Armor', 'Boots'] as const
export type VisualSlot = typeof VISUAL_SLOTS[number]

export const ALL_SPRITES = {
  hero:     HERO_SPRITE,
  slime:    SLIME_SPRITE,
  bat:      BAT_SPRITE,
  skeleton: SKELETON_SPRITE,
  boss:     BOSS_SPRITE,
}
```

- [ ] **Step 2: Build to verify no type errors**

```bash
cd client && npx tsc --noEmit 2>&1 | grep sprites
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/combat/sprites.ts
git commit -m "feat(client): add pixel art sprite and overlay definitions"
```

---

## Task 10: BootScene — Bake textures at startup

**Files:**
- Modify: `client/src/scenes/BootScene.ts`

- [ ] **Step 1: Read current BootScene**

Read `client/src/scenes/BootScene.ts` to understand its current structure before editing.

- [ ] **Step 2: Add texture baking to BootScene**

Add the `buildTexture` helper and call it for all sprites and overlays. The full updated `BootScene.ts`:

```typescript
import Phaser from 'phaser'
import { ALL_SPRITES, OVERLAYS, PX } from '../combat/sprites'
import type { SpriteDef } from '../combat/sprites'

function buildTexture(scene: Phaser.Scene, key: string, def: SpriteDef): void {
  if (scene.textures.exists(key)) return
  const cols = def.rows[0].length
  const rows = def.rows.length
  const tex  = scene.textures.createCanvas(key, cols * PX, rows * PX)
  if (!tex) return
  const ctx  = tex.getContext()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = def.rows[y][x]
      if (ch === '.' || !def.pal[ch]) continue
      ctx.fillStyle = def.pal[ch]
      ctx.fillRect(x * PX, y * PX, PX, PX)
    }
  }
  tex.refresh()
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  create(): void {
    // Bake base sprites
    for (const [key, def] of Object.entries(ALL_SPRITES)) {
      buildTexture(this, `spr_${key}`, def)
    }

    // Bake equipment overlays
    for (const [name, def] of Object.entries(OVERLAYS)) {
      if (def) buildTexture(this, `overlay_${name}`, def)
    }

    this.scene.start('CharacterSelect')
  }
}
```

- [ ] **Step 3: Build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/BootScene.ts
git commit -m "feat(client): bake pixel art textures in BootScene"
```

---

## Task 11: PaperDollContainer

**Files:**
- Create: `client/src/combat/PaperDollContainer.ts`
- Create: `client/src/__tests__/combat/PaperDollContainer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/__tests__/combat/PaperDollContainer.test.ts
import { describe, it, expect, vi } from 'vitest'

// Minimal Phaser mock — just enough to test PaperDollContainer logic
const mockImage = () => ({
  setVisible: vi.fn().mockReturnThis(),
  setTexture: vi.fn().mockReturnThis(),
  setPosition: vi.fn().mockReturnThis(),
  setDepth: vi.fn().mockReturnThis(),
  setFlipX: vi.fn().mockReturnThis(),
})

const mockContainer = {
  add: vi.fn(),
  setPosition: vi.fn().mockReturnThis(),
  x: 0,
  y: 0,
}

const mockScene = {
  add: {
    image: vi.fn(() => mockImage()),
    container: vi.fn(() => mockContainer),
  },
  textures: {
    exists: vi.fn(() => true),
  },
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {},
    },
  },
}))

describe('PaperDollContainer', () => {
  it('equip sets layer texture when overlay exists', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as any, 100, 200)
    doll.equip('Weapon', 'Iron Sword')
    const weaponLayer = (doll as any).layers.get('Weapon')
    expect(weaponLayer.setVisible).toHaveBeenCalledWith(true)
    expect(weaponLayer.setTexture).toHaveBeenCalledWith('overlay_Iron Sword')
  })

  it('unequip hides the layer', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as any, 100, 200)
    doll.equip('Weapon', 'Iron Sword')
    doll.unequip('Weapon')
    const weaponLayer = (doll as any).layers.get('Weapon')
    expect(weaponLayer.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('equip Ring does nothing (no visual layer)', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as any, 100, 200)
    expect(() => doll.equip('Ring', 'Copper Ring')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd client && npm test -- --run src/__tests__/combat/PaperDollContainer.test.ts 2>&1 | tail -10
```

Expected: FAIL — `../../combat/PaperDollContainer` not found.

- [ ] **Step 3: Implement PaperDollContainer.ts**

```typescript
// client/src/combat/PaperDollContainer.ts
import Phaser from 'phaser'
import type { EquipmentSlot } from '../types/api'
import { VISUAL_SLOTS, overlayKey } from './sprites'

export class PaperDollContainer {
  private container: Phaser.GameObjects.Container
  private base: Phaser.GameObjects.Image
  readonly layers: Map<string, Phaser.GameObjects.Image> = new Map()

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.base = scene.add.image(0, 0, 'spr_hero')

    // Build one layer per visual slot, all hidden initially
    const layerImages: Phaser.GameObjects.Image[] = []
    let depth = 1
    for (const slot of VISUAL_SLOTS) {
      const layer = scene.add.image(0, 0, 'spr_hero')
        .setVisible(false)
        .setDepth(depth++)
      this.layers.set(slot, layer)
      layerImages.push(layer)
    }

    this.container = scene.add.container(x, y, [this.base, ...layerImages])
  }

  equip(slot: EquipmentSlot, itemName: string): void {
    const layer = this.layers.get(slot)
    if (!layer) return  // Ring / Amulet — no visual layer
    const key = overlayKey(itemName)
    if (key) {
      layer.setTexture(`overlay_${key}`).setVisible(true)
    } else {
      layer.setVisible(false)
    }
  }

  unequip(slot: EquipmentSlot): void {
    this.layers.get(slot)?.setVisible(false)
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y)
    return this
  }

  setFlipX(flip: boolean): this {
    this.base.setFlipX(flip)
    this.layers.forEach(l => l.setFlipX(flip))
    return this
  }

  setDepth(depth: number): this {
    this.container.setDepth(depth)
    return this
  }

  get x(): number { return this.container.x }
  get y(): number { return this.container.y }

  destroy(): void {
    this.container.destroy(true)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd client && npm test -- --run src/__tests__/combat/PaperDollContainer.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 5: Build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/src/combat/PaperDollContainer.ts client/src/__tests__/combat/PaperDollContainer.test.ts
git commit -m "feat(client): add PaperDollContainer with per-slot overlay layers"
```

---

## Task 12: CharacterSheetScene — Stats tab with paper doll

**Files:**
- Modify: `client/src/scenes/CharacterSheetScene.ts`

The CharacterSheetScene is being updated here only for the **stats tab** (paper doll + slot boxes). The full 3-tab rewrite happens in Slice 4. This task adds the paper doll to the existing scene as a preview.

- [ ] **Step 1: Update CharacterSheetScene to show paper doll and equipped slots**

Replace the full content of `client/src/scenes/CharacterSheetScene.ts`:

```typescript
import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { PaperDollContainer } from '../combat/PaperDollContainer'
import { getInventory, getEquipped, equipItem, unequipItem } from '../api/items'
import type { InventoryItem, EquipmentSlot } from '../types/api'

const RARITY_COLOR: Record<string, number> = {
  Common:   0xb8c0cc,
  Uncommon: 0x5ec05e,
  Rare:     0x4da3ff,
  Epic:     0xc45aff,
}

const SLOTS: EquipmentSlot[] = ['Helmet','Armor','Weapon','Boots','Ring','Amulet']
const SLOT_POSITIONS: Record<EquipmentSlot, { x: number; y: number }> = {
  Helmet: { x: 400, y: 160 },
  Armor:  { x: 400, y: 260 },
  Weapon: { x: 260, y: 210 },
  Boots:  { x: 400, y: 360 },
  Ring:   { x: 540, y: 160 },
  Amulet: { x: 540, y: 260 },
}

export class CharacterSheetScene extends Phaser.Scene {
  private doll!: PaperDollContainer

  constructor() {
    super({ key: 'CharacterSheet' })
  }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) { this.scene.start('CharacterSelect'); return }

    this.add.rectangle(400, 300, 800, 600, 0x111122)
    this.add.text(400, 20, 'CHARACTER SHEET', {
      font: '18px monospace', color: '#ffffff',
    }).setOrigin(0.5)

    // Paper doll center
    this.doll = new PaperDollContainer(this, 400, 280)
    this.doll.setDepth(5)

    // Stat block
    const leftX = 40
    const stats = [
      `Name:     ${char.name}`,
      `Class:    ${char.class}`,
      `Level:    ${char.level}`,
      `XP:       ${char.xp} / ${char.xp_to_next}`,
      `Gold:     ${char.gold}`,
      ``,
      `HP:       ${char.hp} / ${char.max_hp}`,
      `Attack:   ${char.attack}`,
      `Defense:  ${char.defense}`,
      `Crit:     ${char.critical}%`,
      `CDR:      ${char.cdr}%`,
    ]
    stats.forEach((line, i) => {
      this.add.text(leftX, 60 + i * 26, line, {
        font: '13px monospace', color: '#cccccc',
      })
    })

    // Load and render equipped items
    try {
      const [inventory, equipped] = await Promise.all([
        getInventory(char.id),
        getEquipped(char.id),
      ])
      GameState.instance.inventory = inventory
      GameState.instance.equipped  = equipped

      // Apply to doll
      for (const slot of SLOTS) {
        const item = equipped[slot]
        if (item) this.doll.equip(slot, item.template.name)
      }

      this.buildSlotBoxes(equipped)
    } catch (e) {
      this.add.text(400, 500, 'Error loading inventory', {
        font: '13px monospace', color: '#ff4444',
      }).setOrigin(0.5)
    }

    // Back button
    const backBtn = this.add.rectangle(400, 560, 140, 36, 0x334455)
      .setStrokeStyle(1, 0x6688aa).setInteractive({ useHandCursor: true })
    this.add.text(400, 560, 'Back', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    backBtn.on('pointerover', () => backBtn.setFillStyle(0x445566))
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x334455))
    backBtn.on('pointerdown', () => this.scene.start('Hub'))
  }

  private buildSlotBoxes(equipped: Record<string, InventoryItem | undefined>): void {
    const char = GameState.instance.character!
    for (const slot of SLOTS) {
      const pos  = SLOT_POSITIONS[slot]
      const item = equipped[slot as EquipmentSlot]

      const box = this.add.rectangle(pos.x, pos.y, 140, 50, 0x222233)
        .setStrokeStyle(1, item ? RARITY_COLOR[item.template.rarity] : 0x444444)
        .setInteractive({ useHandCursor: true })

      const label = this.add.text(pos.x, pos.y - 10, slot, {
        font: '10px monospace', color: '#888888',
      }).setOrigin(0.5)

      const nameText = this.add.text(pos.x, pos.y + 8,
        item ? item.template.name : '—', {
          font: '11px monospace',
          color: item ? `#${RARITY_COLOR[item.template.rarity].toString(16).padStart(6,'0')}` : '#555555',
        }).setOrigin(0.5)

      if (item) {
        box.on('pointerdown', async () => {
          box.disableInteractive()
          try {
            const updated = await unequipItem(char.id, slot as EquipmentSlot)
            GameState.instance.character = updated
            this.doll.unequip(slot as EquipmentSlot)
            nameText.setText('—').setColor('#555555')
            box.setStrokeStyle(1, 0x444444)
            delete GameState.instance.equipped[slot as EquipmentSlot]
          } finally {
            box.setInteractive({ useHandCursor: true })
          }
        })
      }
    }
  }
}
```

- [ ] **Step 2: Build**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/scenes/CharacterSheetScene.ts
git commit -m "feat(client): CharacterSheetScene shows paper doll and equip slots"
```

---

## Slice 2 Complete ✓

- Pixel art grids in `sprites.ts` (hero, 3 enemies, boss, 10 equipment overlays)
- Textures baked once at startup in `BootScene`
- `PaperDollContainer` renders hero + 4 visual overlay layers
- `CharacterSheetScene` shows paper doll with live equipped items

**Next:** [Slice 3 — Skill Tree](2026-06-12-v6-slice3-skilltree.md)
