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
