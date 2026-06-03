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
