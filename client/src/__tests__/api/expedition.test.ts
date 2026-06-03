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
