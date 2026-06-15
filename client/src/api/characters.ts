import type { Character } from '../types/api'
import { ApiError, request } from './client'

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

function removeStoredId(id: string): void {
  const ids = getStoredIds().filter(x => x !== id)
  localStorage.setItem(CHAR_IDS_KEY, JSON.stringify(ids))
}

export async function getCharacters(): Promise<Character[]> {
  const ids = getStoredIds()
  if (ids.length === 0) return []
  const results = await Promise.all(
    ids.map(id =>
      request<Character>('GET', `/characters/${id}`).catch(err => {
        if (err instanceof ApiError && err.status === 404) {
          removeStoredId(id)
          return null
        }
        throw err
      }),
    ),
  )
  return results.filter((c): c is Character => c !== null)
}

export async function createCharacter(name: string, cls: string): Promise<Character> {
  const char = await request<Character>('POST', '/characters', { name, class: cls })
  addStoredId(char.id)
  return char
}
