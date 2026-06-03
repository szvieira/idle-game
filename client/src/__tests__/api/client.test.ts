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
