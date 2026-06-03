# Client 1 — Phaser 3 TypeScript Client Design

## Context

First browser client for Idle Raid RPG. Connects to the existing Go REST API on `:8080`. Validates the full screen flow end-to-end with real data before any visual design is applied. Placeholder visuals (rectangles + text) throughout — style guide applied in a later pass.

---

## Scope

- Character Select screen
- Character Create screen
- Hub screen (Expedition panel, Dungeon panel stub, Raid panel stub)
- Character Sheet screen

Deferred: Expedition live visualization (Client 2), Dungeon screen (Client 3), Raid screen (Client 4), auth, inventory screen.

---

## Stack

- **Vite** — build tool and dev server
- **Phaser 3** — game framework (scenes, rendering)
- **TypeScript** — strict mode
- **No framework** — pure Phaser scenes, no React/Vue/Svelte

Located at `client/` in the repo root.

---

## Project Structure

```
client/
  src/
    api/
      client.ts         — fetch wrapper, base URL, error handling
      characters.ts     — getCharacters(), createCharacter()
      expedition.ts     — getExpedition(), startExpedition(), collect(), pause(), resume(), switchZone()
    scenes/
      BootScene.ts      — startup routing (no visuals)
      CharacterSelectScene.ts
      CharacterCreateScene.ts
      HubScene.ts
      CharacterSheetScene.ts
    state/
      GameState.ts      — singleton: activeCharacter, expeditionRun
    types/
      api.ts            — TypeScript interfaces matching Go response shapes
    main.ts             — Phaser.Game config, registers all scenes
  index.html
  vite.config.ts
  tsconfig.json
  package.json
```

---

## API Client

`api/client.ts` — thin fetch wrapper:

```ts
const BASE = 'http://localhost:8080'

async function request<T>(method: string, path: string, body?: unknown): Promise<T>
// throws ApiError on non-2xx responses
```

`api/characters.ts`:
- `getCharacters(): Promise<Character[]>`
- `createCharacter(name, cls): Promise<Character>`

`api/expedition.ts`:
- `getExpedition(id): Promise<ExpeditionRun>`
- `startExpedition(characterId, zoneId): Promise<ExpeditionRun>`
- `collectExpedition(id): Promise<CollectResult>`
- `pauseExpedition(id): Promise<void>`
- `resumeExpedition(id): Promise<void>`
- `switchZone(id, zoneId): Promise<SwitchZoneResult>`

---

## Types

`types/api.ts` — mirrors Go JSON response shapes:

```ts
interface Character {
  id: string
  name: string
  class: 'Warrior' | 'Mage' | 'Priest'
  level: number
  xp: number
  xp_to_next: number
  gold: number
  hp: number
  max_hp: number
  mana: number
  max_mana: number
  attack: number
  defense: number
  critical: number
  cdr: number
}

interface ExpeditionRun {
  id: string
  character_id: string
  zone_id: string
  zone_name: string
  status: 'active' | 'paused'
  started_at: string
  elapsed_seconds: number
}

interface CollectResult {
  cannot_survive: boolean
  xp_gained: number
  gold_gained: number
  levels_gained: number
  elapsed_seconds: number
  character: Character
  loot: LootEntry[]
}

interface LootEntry {
  inventory_item_id: string
  name: string
  rarity: string
  slot: string
}
```

---

## GameState Singleton

`state/GameState.ts`:

```ts
class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null
  static readonly instance = new GameState()
}
```

Scenes read/write `GameState.instance` directly. No reactivity. Each scene pulls fresh data from API on `create()` and updates state after mutations.

---

## Scenes

### BootScene

- Runs on startup, no visuals rendered
- Calls `getCharacters()`
- If empty → `this.scene.start('CharacterCreate')`
- If found → `this.scene.start('CharacterSelect', { characters })`

### CharacterSelectScene

- Renders one card per character: `Rectangle` + `Text` (name, class, level)
- "Create New" button at bottom
- Click card → `GameState.instance.character = selected` → `scene.start('Hub')`
- Click "Create New" → `scene.start('CharacterCreate')`

### CharacterCreateScene

- Name: Phaser DOM `<input>` element overlaid on canvas
- Three class cards (Rectangle + Text): class name, role, short description
- Confirm button (visually disabled until name filled + class selected)
- Confirm → `createCharacter(name, class)` → set `GameState.instance.character` → `scene.start('Hub')`

### HubScene

Initializes on `create()`:
1. Load `GameState.instance.character`
2. Call `startExpedition(characterId, 'forest')` — idempotent, returns existing run if active
3. Store result in `GameState.instance.expeditionRun`
4. Render three panels + header

**Header:** character name, class, level

**Expedition panel:**
- Zone name
- Elapsed time label — updated every second via `this.time.addEvent`
- Collect button → `collectExpedition(id)` → shows xp_gained + gold_gained from response → refreshes character + run → re-renders panel
- Cannot-survive warning text (hidden by default, shown after collect returns `cannot_survive: true`)

**Dungeon panel:**
- Static text: "The Forsaken Crypt"
- "Enter Dungeon" button — visually disabled, no action

**Raid panel:**
- Static text: "Raid — Coming Soon"

**Navigation:**
- "Character Sheet" button → `scene.start('CharacterSheet')`
- "Switch Character" button → `scene.start('CharacterSelect')`

### CharacterSheetScene

- Reads `GameState.instance.character`
- Renders all stats as text rows (Level, XP, Gold, HP, MaxHP, Mana, MaxMana, Attack, Defense, Critical, CDR)
- Three equipment slot rectangles: Helmet, Armor, Weapon — each labeled "Empty"
- "Back" button → `scene.start('Hub')`

---

## Visuals (Placeholder)

All visuals use Phaser primitives only — no sprites, no asset files loaded:

- Panels: `this.add.rectangle(x, y, w, h, 0x222222)` with `0x444444` stroke
- Buttons: `this.add.rectangle(...)` with `pointerover`/`pointerout` color change
- Text: `this.add.text(x, y, label, { font: '16px monospace', color: '#ffffff' })`
- Selected/active states: fill color change only

Style guide (pixel art, palette, fonts) applied in a separate pass after Client 1 is functional.

---

## Vite Config

Dev server proxies `/characters`, `/expedition-runs` to `http://localhost:8080` to avoid CORS issues during development:

```ts
// vite.config.ts
server: {
  proxy: {
    '/characters': 'http://localhost:8080',
    '/expedition-runs': 'http://localhost:8080',
  }
}
```

---

## Error Handling

- API errors: catch in scene, render error text on screen (`this.add.text(..., 'Error: ' + msg, ...)`)
- No retry logic — player can refresh
- Network errors surface as text, never silent

---

## Verification

```bash
cd client && npm run dev
# Open http://localhost:5173
# 1. First load → CharacterCreate screen
# 2. Create Warrior named "Aldric" → Hub screen
# 3. Expedition panel shows zone + elapsed ticking
# 4. Wait 30s → click Collect → XP/gold update
# 5. Character Sheet button → all stats visible
# 6. Back → Hub
# 7. Switch Character → CharacterSelect
# 8. Select existing character → Hub again
```
