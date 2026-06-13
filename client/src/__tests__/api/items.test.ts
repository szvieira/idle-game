import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

describe('items API', () => {
  beforeEach(() => mockFetch.mockReset())

  it('getInventory calls correct endpoint', async () => {
    const { getInventory } = await import('../../api/items')
    mockOk([])
    const result = await getInventory('char-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/inventory'),
      expect.any(Object),
    )
    expect(result).toEqual([])
  })

  it('equipItem calls POST with slot and item id', async () => {
    const { equipItem } = await import('../../api/items')
    mockOk({ id: 'char-123' })
    await equipItem('char-123', 'Weapon', 'inv-item-456')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/equipment/Weapon'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('unequipItem calls DELETE', async () => {
    const { unequipItem } = await import('../../api/items')
    mockOk({ id: 'char-123' })
    await unequipItem('char-123', 'Weapon')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/equipment/Weapon'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
