import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) })
}

describe('skills API', () => {
  beforeEach(() => mockFetch.mockReset())

  it('getSkills calls correct endpoint', async () => {
    const { getSkills } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind'], equipped_skill: 'whirlwind', available_points: 0 })
    const result = await getSkills('char-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills'),
      expect.any(Object),
    )
    expect(result.unlocked).toContain('whirlwind')
  })

  it('unlockSkill calls POST', async () => {
    const { unlockSkill } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind', 'brute_force'], equipped_skill: 'whirlwind', available_points: 0 })
    await unlockSkill('char-123', 'brute_force')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills/brute_force/unlock'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('equipSkill calls PUT', async () => {
    const { equipSkill } = await import('../../api/skills')
    mockOk({ unlocked: ['whirlwind', 'charge'], equipped_skill: 'charge', available_points: 0 })
    await equipSkill('char-123', 'charge')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/characters/char-123/skills/equipped'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
