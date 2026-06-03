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
