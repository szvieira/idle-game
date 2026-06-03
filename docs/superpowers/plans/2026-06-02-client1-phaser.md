# Client 1 — Phaser 3 TypeScript Browser Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Phaser 3 + TypeScript browser client for Idle Raid RPG that connects to the existing Go REST API on port 8080, covering character select/create, hub with live expedition timer, and character sheet screens.

**Architecture:** Pure Phaser 3 scenes with no UI framework. Each scene fetches fresh data on `create()` and reads/writes via a `GameState` singleton. API layer is a thin `fetch` wrapper. Character listing is localStorage-backed because the Go API exposes `GET /characters/{id}` only — no list endpoint exists. Placeholder visuals only (rectangles + monospace text).

**Tech Stack:** Vite 5, Phaser 3 (^3.88), TypeScript (strict), Vitest 2 + happy-dom

---

## File Map

| File | Role |
|------|------|
| `client/package.json` | Deps and npm scripts |
| `client/vite.config.ts` | Vite + Vitest config, dev proxy |
| `client/tsconfig.json` | TypeScript strict config |
| `client/index.html` | Entry HTML |
| `client/src/main.ts` | Phaser.Game instantiation, scene registry |
| `client/src/types/api.ts` | TypeScript interfaces mirroring Go JSON shapes |
| `client/src/utils.ts` | Pure helpers (`formatElapsed`) |
| `client/src/api/client.ts` | `fetch` wrapper, `ApiError` |
| `client/src/api/characters.ts` | `getCharacters` (localStorage-backed), `createCharacter` |
| `client/src/api/expedition.ts` | `startExpedition`, `getExpedition`, `collectExpedition`, `pauseExpedition`, `resumeExpedition`, `switchZone` |
| `client/src/state/GameState.ts` | Singleton: active character + expedition run |
| `client/src/scenes/BootScene.ts` | Startup routing, no visuals |
| `client/src/scenes/CharacterSelectScene.ts` | Character card list, select or create |
| `client/src/scenes/CharacterCreateScene.ts` | Name input + class cards + confirm |
| `client/src/scenes/HubScene.ts` | 3-panel hub with live expedition timer |
| `client/src/scenes/CharacterSheetScene.ts` | Stats display + equipment slots |
| `client/src/__tests__/utils.test.ts` | Tests for `formatElapsed` |
| `client/src/__tests__/api/client.test.ts` | Tests for fetch wrapper |
| `client/src/__tests__/api/characters.test.ts` | Tests for characters API + localStorage |
| `client/src/__tests__/api/expedition.test.ts` | Tests for expedition API |

> **API note — no character list endpoint:** `GET /characters/{id}` exists, `GET /characters` does not. `getCharacters()` stores IDs in `localStorage` key `characterIds` on each create and fetches each by ID on startup.
>
> **Expedition zone route:** Switch zone is `POST /expedition-runs/{id}/zone` (not `/switch-zone`). Body: `{ zone_id }`.

---

### Task 1: Project Scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/index.html`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "idle-raid-client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "phaser": "^3.88.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "happy-dom": "^14.0.0"
  }
}
```

- [ ] **Step 2: Create `client/vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/characters': 'http://localhost:8080',
      '/expedition-runs': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

- [ ] **Step 3: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Idle Raid RPG</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Install dependencies**

```bash
cd client && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
cd client && git add package.json vite.config.ts tsconfig.json index.html package-lock.json
git commit -m "feat(client): scaffold Vite + Phaser 3 + TypeScript project"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `client/src/types/api.ts`

- [ ] **Step 1: Create `client/src/types/api.ts`**

```ts
export interface Character {
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

export interface ExpeditionRun {
  id: string
  character_id: string
  zone_id: string
  zone_name: string
  status: 'active' | 'paused'
  started_at: string
  elapsed_seconds: number
}

export interface LootEntry {
  inventory_item_id: string
  name: string
  rarity: string
  slot: string
}

export interface CollectResult {
  cannot_survive: boolean
  xp_gained: number
  gold_gained: number
  levels_gained: number
  elapsed_seconds: number
  character: Character
  loot: LootEntry[]
}

export interface SwitchZoneResult {
  zone_id: string
  zone_name: string
  collect: CollectResult
}
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/api.ts
git commit -m "feat(client): add TypeScript API types"
```

---

### Task 3: Utility — formatElapsed

**Files:**
- Create: `client/src/utils.ts`
- Create: `client/src/__tests__/utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `client/src/__tests__/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../utils'

describe('formatElapsed', () => {
  it('formats zero seconds', () => {
    expect(formatElapsed(0)).toBe('0m 0s')
  })

  it('formats seconds only', () => {
    expect(formatElapsed(45)).toBe('0m 45s')
  })

  it('formats exactly one minute', () => {
    expect(formatElapsed(60)).toBe('1m 0s')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(125)).toBe('2m 5s')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd client && npm test -- src/__tests__/utils.test.ts
```

Expected: FAIL — `Cannot find module '../utils'`

- [ ] **Step 3: Implement `client/src/utils.ts`**

```ts
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd client && npm test -- src/__tests__/utils.test.ts
```

Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "feat(client): add formatElapsed utility with tests"
```

---

### Task 4: API Base Client

**Files:**
- Create: `client/src/api/client.ts`
- Create: `client/src/__tests__/api/client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `client/src/__tests__/api/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request, ApiError } from '../../api/client'

describe('request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'abc', name: 'Aldric' }),
    } as Response)

    const result = await request<{ id: string; name: string }>('GET', '/characters/abc')
    expect(result).toEqual({ id: 'abc', name: 'Aldric' })
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/characters/abc',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('sends JSON body on POST', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'xyz' }),
    } as Response)

    await request('POST', '/characters', { name: 'Aldric', class: 'Warrior' })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/characters',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Aldric', class: 'Warrior' }),
      })
    )
  })

  it('throws ApiError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('character not found'),
    } as Response)

    await expect(request('GET', '/characters/bad')).rejects.toThrow(ApiError)
  })

  it('ApiError carries status and message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
    } as Response)

    let err: ApiError | undefined
    try {
      await request('POST', '/characters', {})
    } catch (e) {
      err = e as ApiError
    }

    expect(err?.status).toBe(400)
    expect(err?.message).toBe('bad request')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd client && npm test -- src/__tests__/api/client.test.ts
```

Expected: FAIL — `Cannot find module '../../api/client'`

- [ ] **Step 3: Implement `client/src/api/client.ts`**

```ts
const BASE = 'http://localhost:8080'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, text)
  }

  return res.json() as Promise<T>
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd client && npm test -- src/__tests__/api/client.test.ts
```

Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/__tests__/api/client.test.ts
git commit -m "feat(client): add API fetch wrapper with ApiError"
```

---

### Task 5: Characters API

**Files:**
- Create: `client/src/api/characters.ts`
- Create: `client/src/__tests__/api/characters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `client/src/__tests__/api/characters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCharacters, createCharacter } from '../../api/characters'
import type { Character } from '../../types/api'

const makeChar = (id: string): Character => ({
  id, name: 'Aldric', class: 'Warrior', level: 1, xp: 0, xp_to_next: 100,
  gold: 0, hp: 120, max_hp: 120, mana: 30, max_mana: 30,
  attack: 15, defense: 10, critical: 5, cdr: 0,
})

describe('characters API', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getCharacters', () => {
    it('returns empty array when no IDs in localStorage', async () => {
      const result = await getCharacters()
      expect(result).toEqual([])
      expect(fetch).not.toHaveBeenCalled()
    })

    it('fetches each stored character by ID', async () => {
      localStorage.setItem('characterIds', JSON.stringify(['id1', 'id2']))
      const char1 = makeChar('id1')
      const char2 = makeChar('id2')

      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(char1) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(char2) } as Response)

      const result = await getCharacters()
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('id1')
      expect(result[1].id).toBe('id2')
    })
  })

  describe('createCharacter', () => {
    it('POSTs to /characters and returns character', async () => {
      const char = makeChar('new-id')
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(char),
      } as Response)

      const result = await createCharacter('Aldric', 'Warrior')
      expect(result.id).toBe('new-id')
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/characters',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('stores created character ID in localStorage', async () => {
      const char = makeChar('new-id')
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(char),
      } as Response)

      await createCharacter('Aldric', 'Warrior')

      const stored = JSON.parse(localStorage.getItem('characterIds') ?? '[]') as string[]
      expect(stored).toContain('new-id')
    })

    it('does not duplicate IDs in localStorage', async () => {
      localStorage.setItem('characterIds', JSON.stringify(['new-id']))
      const char = makeChar('new-id')
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(char),
      } as Response)

      await createCharacter('Aldric', 'Warrior')

      const stored = JSON.parse(localStorage.getItem('characterIds') ?? '[]') as string[]
      expect(stored.filter((id: string) => id === 'new-id')).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd client && npm test -- src/__tests__/api/characters.test.ts
```

Expected: FAIL — `Cannot find module '../../api/characters'`

- [ ] **Step 3: Implement `client/src/api/characters.ts`**

```ts
import type { Character } from '../types/api'
import { request } from './client'

const CHAR_IDS_KEY = 'characterIds'

function getStoredIds(): string[] {
  const raw = localStorage.getItem(CHAR_IDS_KEY)
  return raw ? (JSON.parse(raw) as string[]) : []
}

function addStoredId(id: string): void {
  const ids = getStoredIds()
  if (!ids.includes(id)) {
    localStorage.setItem(CHAR_IDS_KEY, JSON.stringify([...ids, id]))
  }
}

export async function getCharacters(): Promise<Character[]> {
  const ids = getStoredIds()
  if (ids.length === 0) return []
  return Promise.all(ids.map(id => request<Character>('GET', `/characters/${id}`)))
}

export async function createCharacter(name: string, cls: string): Promise<Character> {
  const char = await request<Character>('POST', '/characters', { name, class: cls })
  addStoredId(char.id)
  return char
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd client && npm test -- src/__tests__/api/characters.test.ts
```

Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/characters.ts src/__tests__/api/characters.test.ts
git commit -m "feat(client): add characters API with localStorage ID tracking"
```

---

### Task 6: Expedition API

**Files:**
- Create: `client/src/api/expedition.ts`
- Create: `client/src/__tests__/api/expedition.test.ts`

- [ ] **Step 1: Write failing tests**

Create `client/src/__tests__/api/expedition.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startExpedition,
  getExpedition,
  collectExpedition,
  pauseExpedition,
  resumeExpedition,
  switchZone,
} from '../../api/expedition'
import type { ExpeditionRun, CollectResult, SwitchZoneResult } from '../../types/api'

const makeRun = (): ExpeditionRun => ({
  id: 'run-1',
  character_id: 'char-1',
  zone_id: 'forest',
  zone_name: 'Forest',
  status: 'active',
  started_at: '2026-06-01T00:00:00Z',
  elapsed_seconds: 120,
})

const makeCollect = (): CollectResult => ({
  cannot_survive: false,
  xp_gained: 50,
  gold_gained: 20,
  levels_gained: 0,
  elapsed_seconds: 120,
  character: {
    id: 'char-1', name: 'Aldric', class: 'Warrior', level: 1,
    xp: 50, xp_to_next: 50, gold: 20, hp: 120, max_hp: 120,
    mana: 30, max_mana: 30, attack: 15, defense: 10, critical: 5, cdr: 0,
  },
  loot: [],
})

describe('expedition API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('startExpedition POSTs to /expedition-runs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRun()),
    } as Response)

    const result = await startExpedition('char-1', 'forest')
    expect(result.zone_id).toBe('forest')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('getExpedition GETs /expedition-runs/{id}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRun()),
    } as Response)

    const result = await getExpedition('run-1')
    expect(result.id).toBe('run-1')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs/run-1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('collectExpedition POSTs to /expedition-runs/{id}/collect', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeCollect()),
    } as Response)

    const result = await collectExpedition('run-1')
    expect(result.xp_gained).toBe(50)
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs/run-1/collect',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('pauseExpedition POSTs to /expedition-runs/{id}/pause', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'paused' }),
    } as Response)

    await pauseExpedition('run-1')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs/run-1/pause',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('resumeExpedition POSTs to /expedition-runs/{id}/resume', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'active' }),
    } as Response)

    await resumeExpedition('run-1')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs/run-1/resume',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('switchZone POSTs to /expedition-runs/{id}/zone with zone_id body', async () => {
    const switchResult: SwitchZoneResult = {
      zone_id: 'ruins',
      zone_name: 'Ruins',
      collect: makeCollect(),
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(switchResult),
    } as Response)

    const result = await switchZone('run-1', 'ruins')
    expect(result.zone_id).toBe('ruins')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/expedition-runs/run-1/zone',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ zone_id: 'ruins' }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd client && npm test -- src/__tests__/api/expedition.test.ts
```

Expected: FAIL — `Cannot find module '../../api/expedition'`

- [ ] **Step 3: Implement `client/src/api/expedition.ts`**

```ts
import type { ExpeditionRun, CollectResult, SwitchZoneResult } from '../types/api'
import { request } from './client'

export async function startExpedition(characterId: string, zoneId: string): Promise<ExpeditionRun> {
  return request<ExpeditionRun>('POST', '/expedition-runs', {
    character_id: characterId,
    zone_id: zoneId,
  })
}

export async function getExpedition(id: string): Promise<ExpeditionRun> {
  return request<ExpeditionRun>('GET', `/expedition-runs/${id}`)
}

export async function collectExpedition(id: string): Promise<CollectResult> {
  return request<CollectResult>('POST', `/expedition-runs/${id}/collect`)
}

export async function pauseExpedition(id: string): Promise<void> {
  await request<unknown>('POST', `/expedition-runs/${id}/pause`)
}

export async function resumeExpedition(id: string): Promise<void> {
  await request<unknown>('POST', `/expedition-runs/${id}/resume`)
}

export async function switchZone(id: string, zoneId: string): Promise<SwitchZoneResult> {
  return request<SwitchZoneResult>('POST', `/expedition-runs/${id}/zone`, { zone_id: zoneId })
}
```

- [ ] **Step 4: Run all tests — expect pass**

```bash
cd client && npm test
```

Expected: PASS — all tests (utils + client + characters + expedition) pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/expedition.ts src/__tests__/api/expedition.test.ts
git commit -m "feat(client): add expedition API functions with tests"
```

---

### Task 7: GameState Singleton

**Files:**
- Create: `client/src/state/GameState.ts`

- [ ] **Step 1: Create `client/src/state/GameState.ts`**

```ts
import type { Character, ExpeditionRun } from '../types/api'

export class GameState {
  character: Character | null = null
  expeditionRun: ExpeditionRun | null = null

  static readonly instance = new GameState()
}
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/GameState.ts
git commit -m "feat(client): add GameState singleton"
```

---

### Task 8: Phaser Entry Point + BootScene

**Files:**
- Create: `client/src/main.ts`
- Create: `client/src/scenes/BootScene.ts`
- Create: `client/src/scenes/CharacterSelectScene.ts` (stub)
- Create: `client/src/scenes/CharacterCreateScene.ts` (stub)
- Create: `client/src/scenes/HubScene.ts` (stub)
- Create: `client/src/scenes/CharacterSheetScene.ts` (stub)

- [ ] **Step 1: Create `client/src/scenes/BootScene.ts`**

```ts
import Phaser from 'phaser'
import { getCharacters } from '../api/characters'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  async create(): Promise<void> {
    try {
      const characters = await getCharacters()
      if (characters.length === 0) {
        this.scene.start('CharacterCreate')
      } else {
        this.scene.start('CharacterSelect', { characters })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, {
        font: '16px monospace',
        color: '#ff4444',
      })
    }
  }
}
```

- [ ] **Step 2: Create stub scenes**

Create `client/src/scenes/CharacterSelectScene.ts`:

```ts
import Phaser from 'phaser'

export class CharacterSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'CharacterSelect' }) }
  create(_data: unknown): void {}
}
```

Create `client/src/scenes/CharacterCreateScene.ts`:

```ts
import Phaser from 'phaser'

export class CharacterCreateScene extends Phaser.Scene {
  constructor() { super({ key: 'CharacterCreate' }) }
  create(): void {}
}
```

Create `client/src/scenes/HubScene.ts`:

```ts
import Phaser from 'phaser'

export class HubScene extends Phaser.Scene {
  constructor() { super({ key: 'Hub' }) }
  create(): void {}
}
```

Create `client/src/scenes/CharacterSheetScene.ts`:

```ts
import Phaser from 'phaser'

export class CharacterSheetScene extends Phaser.Scene {
  constructor() { super({ key: 'CharacterSheet' }) }
  create(): void {}
}
```

- [ ] **Step 3: Create `client/src/main.ts`**

```ts
import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { CharacterCreateScene } from './scenes/CharacterCreateScene'
import { HubScene } from './scenes/HubScene'
import { CharacterSheetScene } from './scenes/CharacterSheetScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#111111',
  dom: { createContainer: true },
  scene: [BootScene, CharacterSelectScene, CharacterCreateScene, HubScene, CharacterSheetScene],
})
```

- [ ] **Step 4: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/scenes/BootScene.ts src/scenes/CharacterSelectScene.ts src/scenes/CharacterCreateScene.ts src/scenes/HubScene.ts src/scenes/CharacterSheetScene.ts
git commit -m "feat(client): add Phaser entry point, BootScene, and scene stubs"
```

---

### Task 9: CharacterSelectScene

**Files:**
- Modify: `client/src/scenes/CharacterSelectScene.ts`

- [ ] **Step 1: Replace stub with full implementation**

```ts
import Phaser from 'phaser'
import type { Character } from '../types/api'
import { GameState } from '../state/GameState'

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharacterSelect' })
  }

  create(data: { characters: Character[] }): void {
    const { width } = this.scale

    this.add.text(width / 2, 30, 'Select Your Character', {
      font: '24px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    const cardW = 500
    const cardH = 80
    const cardX = width / 2
    const startY = 100

    data.characters.forEach((char, i) => {
      const y = startY + i * (cardH + 10)
      const bg = this.add.rectangle(cardX, y + cardH / 2, cardW, cardH, 0x222222)
        .setStrokeStyle(1, 0x444444)
        .setInteractive({ useHandCursor: true })

      this.add.text(cardX - 230, y + 10, char.name, { font: '18px monospace', color: '#ffffff' })
      this.add.text(cardX - 230, y + 34, `${char.class}  Lv.${char.level}`, { font: '14px monospace', color: '#aaaaaa' })
      this.add.text(cardX + 80, y + 10, `HP: ${char.hp}/${char.max_hp}`, { font: '14px monospace', color: '#aaaaaa' })
      this.add.text(cardX + 80, y + 34, `Gold: ${char.gold}`, { font: '14px monospace', color: '#aaaaaa' })

      bg.on('pointerover', () => bg.setFillStyle(0x333333))
      bg.on('pointerout', () => bg.setFillStyle(0x222222))
      bg.on('pointerdown', () => {
        GameState.instance.character = char
        this.scene.start('Hub')
      })
    })

    const createY = startY + data.characters.length * (cardH + 10) + 20
    const createBtn = this.add.rectangle(cardX, createY + 20, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(cardX, createY + 20, 'Create New', { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    createBtn.on('pointerover', () => createBtn.setFillStyle(0x445566))
    createBtn.on('pointerout', () => createBtn.setFillStyle(0x334455))
    createBtn.on('pointerdown', () => this.scene.start('CharacterCreate'))
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/CharacterSelectScene.ts
git commit -m "feat(client): implement CharacterSelectScene"
```

---

### Task 10: CharacterCreateScene

**Files:**
- Modify: `client/src/scenes/CharacterCreateScene.ts`

- [ ] **Step 1: Replace stub with full implementation**

```ts
import Phaser from 'phaser'
import { createCharacter } from '../api/characters'
import { GameState } from '../state/GameState'

const CLASSES = [
  { cls: 'Warrior', role: 'Tank / Melee DPS', desc: 'High HP and defense' },
  { cls: 'Mage',    role: 'Ranged DPS',       desc: 'High attack and crit' },
  { cls: 'Priest',  role: 'Support / Healer', desc: 'High mana and CDR' },
] as const

export class CharacterCreateScene extends Phaser.Scene {
  private selectedClass: string | null = null
  private confirmBtn!: Phaser.GameObjects.Rectangle
  private confirmLabel!: Phaser.GameObjects.Text
  private errorText!: Phaser.GameObjects.Text
  private nameInput!: Phaser.GameObjects.DOMElement

  constructor() {
    super({ key: 'CharacterCreate' })
  }

  create(): void {
    const { width } = this.scale

    this.add.text(width / 2, 30, 'Create Character', {
      font: '24px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.add.text(60, 88, 'Name:', { font: '16px monospace', color: '#cccccc' })
    const inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.maxLength = 24
    inputEl.style.cssText = 'width:220px;font-size:16px;padding:4px 8px;background:#222;color:#fff;border:1px solid #555;outline:none;'
    this.nameInput = this.add.dom(300, 100, inputEl)
    inputEl.addEventListener('input', () => this.refreshConfirm())

    this.add.text(width / 2, 148, 'Choose Class', {
      font: '16px monospace',
      color: '#cccccc',
    }).setOrigin(0.5)

    const cardW = 200
    const cardH = 120
    const cardY = 250
    const positions = [180, 400, 620]
    const classBgs: Phaser.GameObjects.Rectangle[] = []

    CLASSES.forEach(({ cls, role, desc }, i) => {
      const x = positions[i]
      const bg = this.add.rectangle(x, cardY, cardW, cardH, 0x222222)
        .setStrokeStyle(1, 0x444444)
        .setInteractive({ useHandCursor: true })
      classBgs.push(bg)

      this.add.text(x, cardY - 44, cls,  { font: '18px monospace', color: '#ffffff' }).setOrigin(0.5)
      this.add.text(x, cardY - 18, role, { font: '12px monospace', color: '#aaaaaa' }).setOrigin(0.5)
      this.add.text(x, cardY + 6,  desc, { font: '12px monospace', color: '#888888' }).setOrigin(0.5)

      bg.on('pointerdown', () => {
        this.selectedClass = cls
        classBgs.forEach((b, j) => b.setFillStyle(j === i ? 0x334455 : 0x222222))
        this.refreshConfirm()
      })
      bg.on('pointerover', () => { if (this.selectedClass !== cls) bg.setFillStyle(0x2a2a2a) })
      bg.on('pointerout',  () => { if (this.selectedClass !== cls) bg.setFillStyle(0x222222) })
    })

    this.confirmBtn = this.add.rectangle(width / 2, 370, 200, 44, 0x333333)
      .setStrokeStyle(1, 0x555555)
    this.confirmLabel = this.add.text(width / 2, 370, 'Confirm', {
      font: '18px monospace',
      color: '#666666',
    }).setOrigin(0.5)

    this.errorText = this.add.text(width / 2, 424, '', {
      font: '14px monospace',
      color: '#ff4444',
    }).setOrigin(0.5)
  }

  private refreshConfirm(): void {
    const inputEl = this.nameInput.node as HTMLInputElement
    const ready = inputEl.value.trim().length > 0 && this.selectedClass !== null

    this.confirmBtn.setFillStyle(ready ? 0x334455 : 0x333333)
    this.confirmBtn.setStrokeStyle(1, ready ? 0x6688aa : 0x555555)
    this.confirmLabel.setColor(ready ? '#ffffff' : '#666666')

    this.confirmBtn.removeAllListeners('pointerdown')
    if (ready) {
      this.confirmBtn.setInteractive({ useHandCursor: true })
      this.confirmBtn.on('pointerdown', () => void this.submit())
    } else {
      this.confirmBtn.disableInteractive()
    }
  }

  private async submit(): Promise<void> {
    const inputEl = this.nameInput.node as HTMLInputElement
    const name = inputEl.value.trim()
    if (!name || !this.selectedClass) return

    this.confirmBtn.disableInteractive()
    this.confirmLabel.setText('Creating...')
    this.errorText.setText('')

    try {
      const char = await createCharacter(name, this.selectedClass)
      GameState.instance.character = char
      this.nameInput.destroy()
      this.scene.start('Hub')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.errorText.setText('Error: ' + msg)
      this.confirmBtn.setInteractive({ useHandCursor: true })
      this.confirmLabel.setText('Confirm')
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/CharacterCreateScene.ts
git commit -m "feat(client): implement CharacterCreateScene"
```

---

### Task 11: HubScene

**Files:**
- Modify: `client/src/scenes/HubScene.ts`

- [ ] **Step 1: Replace stub with full implementation**

```ts
import Phaser from 'phaser'
import type { ExpeditionRun } from '../types/api'
import { startExpedition, collectExpedition } from '../api/expedition'
import { GameState } from '../state/GameState'
import { formatElapsed } from '../utils'

export class HubScene extends Phaser.Scene {
  private elapsedText!: Phaser.GameObjects.Text
  private collectResultText!: Phaser.GameObjects.Text
  private cannotSurviveText!: Phaser.GameObjects.Text
  private timerEvent!: Phaser.Time.TimerEvent

  constructor() {
    super({ key: 'Hub' })
  }

  async create(): Promise<void> {
    const char = GameState.instance.character
    if (!char) {
      this.scene.start('CharacterSelect')
      return
    }

    try {
      const run = await startExpedition(char.id, 'forest')
      GameState.instance.expeditionRun = run
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      this.add.text(10, 10, 'Error: ' + msg, { font: '14px monospace', color: '#ff4444' })
      return
    }

    this.buildUI()
  }

  private buildUI(): void {
    if (this.timerEvent) this.timerEvent.destroy()
    this.children.removeAll(true)

    const char = GameState.instance.character!
    const run = GameState.instance.expeditionRun!
    const { width } = this.scale

    // Header bar
    this.add.rectangle(width / 2, 25, width, 50, 0x1a1a2e)
    this.add.text(20, 12, `${char.name}    ${char.class}    Lv.${char.level}`, {
      font: '16px monospace',
      color: '#ffffff',
    })

    this.buildExpeditionPanel(run)
    this.buildDungeonPanel()
    this.buildRaidPanel()

    // Character Sheet nav
    const sheetBtn = this.add.rectangle(200, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(200, 560, 'Character Sheet', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    sheetBtn.on('pointerover', () => sheetBtn.setFillStyle(0x445566))
    sheetBtn.on('pointerout',  () => sheetBtn.setFillStyle(0x334455))
    sheetBtn.on('pointerdown', () => this.scene.start('CharacterSheet'))

    // Switch Character nav
    const switchBtn = this.add.rectangle(600, 560, 200, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(600, 560, 'Switch Character', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    switchBtn.on('pointerover', () => switchBtn.setFillStyle(0x445566))
    switchBtn.on('pointerout',  () => switchBtn.setFillStyle(0x334455))
    switchBtn.on('pointerdown', () => this.scene.start('CharacterSelect'))

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.tickElapsed,
      callbackScope: this,
      loop: true,
    })
  }

  private buildExpeditionPanel(run: ExpeditionRun): void {
    const cx = 140
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)

    this.add.text(cx, 192, 'Expedition', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 220, run.zone_name, { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    this.elapsedText = this.add.text(cx, 248, `Time: ${formatElapsed(run.elapsed_seconds)}`, {
      font: '14px monospace',
      color: '#cccccc',
    }).setOrigin(0.5)

    this.cannotSurviveText = this.add.text(cx, 278, 'Cannot survive this zone!', {
      font: '12px monospace',
      color: '#ff8844',
    }).setOrigin(0.5).setVisible(false)

    this.collectResultText = this.add.text(cx, 302, '', {
      font: '12px monospace',
      color: '#88ff88',
    }).setOrigin(0.5)

    const collectBtn = this.add.rectangle(cx, 340, 140, 36, 0x225522)
      .setStrokeStyle(1, 0x44aa44)
      .setInteractive({ useHandCursor: true })
    this.add.text(cx, 340, 'Collect', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)

    collectBtn.on('pointerover', () => collectBtn.setFillStyle(0x336633))
    collectBtn.on('pointerout',  () => collectBtn.setFillStyle(0x225522))
    collectBtn.on('pointerdown', async () => {
      collectBtn.disableInteractive()
      try {
        const result = await collectExpedition(GameState.instance.expeditionRun!.id)
        if (result.cannot_survive) {
          this.cannotSurviveText.setVisible(true)
          this.collectResultText.setText('')
        } else {
          GameState.instance.character = result.character
          GameState.instance.expeditionRun = {
            ...GameState.instance.expeditionRun!,
            elapsed_seconds: 0,
          }
          this.cannotSurviveText.setVisible(false)
          this.collectResultText.setText(`+${result.xp_gained} XP  +${result.gold_gained} G`)
          this.elapsedText.setText(`Time: ${formatElapsed(0)}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error'
        this.collectResultText.setText('Error: ' + msg)
      }
      collectBtn.setInteractive({ useHandCursor: true })
    })
  }

  private buildDungeonPanel(): void {
    const cx = 400
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Dungeon', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'The Forsaken Crypt', { font: '14px monospace', color: '#ffffff' }).setOrigin(0.5)
    this.add.rectangle(cx, 340, 160, 36, 0x333333).setStrokeStyle(1, 0x555555)
    this.add.text(cx, 340, 'Enter Dungeon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private buildRaidPanel(): void {
    const cx = 660
    this.add.rectangle(cx, 310, 220, 260, 0x222222).setStrokeStyle(1, 0x444444)
    this.add.text(cx, 192, 'Raid', { font: '14px monospace', color: '#aaaaaa' }).setOrigin(0.5)
    this.add.text(cx, 228, 'Raid — Coming Soon', { font: '14px monospace', color: '#666666' }).setOrigin(0.5)
  }

  private tickElapsed(): void {
    const run = GameState.instance.expeditionRun
    if (!run) return
    run.elapsed_seconds += 1
    this.elapsedText.setText(`Time: ${formatElapsed(run.elapsed_seconds)}`)
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/HubScene.ts
git commit -m "feat(client): implement HubScene with 3 panels and expedition timer"
```

---

### Task 12: CharacterSheetScene

**Files:**
- Modify: `client/src/scenes/CharacterSheetScene.ts`

- [ ] **Step 1: Replace stub with full implementation**

```ts
import Phaser from 'phaser'
import { GameState } from '../state/GameState'

export class CharacterSheetScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharacterSheet' })
  }

  create(): void {
    const char = GameState.instance.character
    if (!char) {
      this.scene.start('CharacterSelect')
      return
    }

    const { width } = this.scale

    this.add.text(width / 2, 24, 'Character Sheet', {
      font: '22px monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    const leftCol = 60
    const rightCol = width / 2 + 20
    const startY = 70
    const lineH = 28

    const leftStats = [
      `Name:     ${char.name}`,
      `Class:    ${char.class}`,
      `Level:    ${char.level}`,
      `XP:       ${char.xp} / ${char.xp_to_next}`,
      `Gold:     ${char.gold}`,
    ]

    const rightStats = [
      `HP:       ${char.hp} / ${char.max_hp}`,
      `Mana:     ${char.mana} / ${char.max_mana}`,
      `Attack:   ${char.attack}`,
      `Defense:  ${char.defense}`,
      `Critical: ${char.critical}`,
      `CDR:      ${char.cdr}`,
    ]

    leftStats.forEach((line, i) => {
      this.add.text(leftCol, startY + i * lineH, line, { font: '16px monospace', color: '#cccccc' })
    })

    rightStats.forEach((line, i) => {
      this.add.text(rightCol, startY + i * lineH, line, { font: '16px monospace', color: '#cccccc' })
    })

    // Equipment slots
    const slots = [
      { label: 'Helmet', x: 160 },
      { label: 'Armor',  x: 400 },
      { label: 'Weapon', x: 640 },
    ]
    const slotY = 350

    slots.forEach(({ label, x }) => {
      this.add.rectangle(x, slotY, 160, 60, 0x222222).setStrokeStyle(1, 0x444444)
      this.add.text(x, slotY - 14, label, { font: '14px monospace', color: '#888888' }).setOrigin(0.5)
      this.add.text(x, slotY + 6,  'Empty', { font: '14px monospace', color: '#555555' }).setOrigin(0.5)
    })

    // Back button
    const backBtn = this.add.rectangle(width / 2, 450, 140, 40, 0x334455)
      .setStrokeStyle(1, 0x6688aa)
      .setInteractive({ useHandCursor: true })
    this.add.text(width / 2, 450, 'Back', { font: '16px monospace', color: '#ffffff' }).setOrigin(0.5)

    backBtn.on('pointerover', () => backBtn.setFillStyle(0x445566))
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x334455))
    backBtn.on('pointerdown', () => this.scene.start('Hub'))
  }
}
```

- [ ] **Step 2: Typecheck + run all tests**

```bash
cd client && npm run typecheck && npm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/CharacterSheetScene.ts
git commit -m "feat(client): implement CharacterSheetScene"
```

---

### Task 13: Browser Verification

- [ ] **Step 1: Ensure the Go server is running**

```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok"}`. If not running, start it:

```bash
# from repo root
docker-compose up -d
# or
go run ./cmd/server
```

- [ ] **Step 2: Start Vite dev server**

```bash
cd client && npm run dev
```

Expected: `Local: http://localhost:5173`

- [ ] **Step 3: First-time flow — CharacterCreate screen**

Open `http://localhost:5173` in browser (clear localStorage if needed via DevTools → Application → localStorage → Clear All).

Expected: CharacterCreate screen shows title, name input, three class cards (Warrior / Mage / Priest), and a greyed-out Confirm button.

- [ ] **Step 4: Create a Warrior named "Aldric"**

1. Click "Warrior" card — card turns blue
2. Type "Aldric" in the name field — Confirm button activates (white text, blue border)
3. Click Confirm

Expected: transitions to Hub screen; header shows `Aldric    Warrior    Lv.1`; Expedition panel shows "Forest" zone and `Time: 0m 0s`.

- [ ] **Step 5: Verify elapsed timer ticks**

Watch hub for 5 seconds.

Expected: `Time: 0m Xs` increments each second.

- [ ] **Step 6: Collect rewards**

Wait 30 seconds, then click Collect.

Expected: result text shows `+N XP  +N G` (positive numbers), timer resets to `Time: 0m 0s`. If zone is too strong, "Cannot survive this zone!" warning appears instead.

- [ ] **Step 7: Character Sheet navigation**

Click "Character Sheet".

Expected: CharacterSheetScene shows Name, Class, Level, XP/to_next, Gold, HP/max, Mana/max, Attack, Defense, Critical, CDR. Three equipment slot rectangles each labeled "Empty".

- [ ] **Step 8: Return to Hub**

Click "Back".

Expected: HubScene loads, expedition timer resumes from current server-side elapsed.

- [ ] **Step 9: Switch Character**

Click "Switch Character".

Expected: CharacterSelectScene with "Aldric" card (name + class + level). "Create New" button at bottom.

- [ ] **Step 10: Select existing character**

Click the Aldric card.

Expected: HubScene loads with Aldric's data, expedition panel active.
