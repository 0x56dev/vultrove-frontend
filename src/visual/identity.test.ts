import { describe, expect, it } from 'vitest'
import { makeIdentity, randomSeed } from './identity'

describe('cosmetic identity', () => {
  it('reproduces the complete family from the same seed', () => {
    expect(makeIdentity([1, 2, 3, 4])).toEqual(makeIdentity([1, 2, 3, 4]))
    expect(makeIdentity([1, 2, 3, 4])).not.toEqual(makeIdentity([9, 8, 7, 6]))
  })
  it('does not read route, fragment, or persistent user data', () => {
    const before = makeIdentity([1, 2, 3, 4])
    window.history.replaceState(null, '', '/c/example#secret')
    localStorage.setItem('filename', 'private.txt')
    try {
      expect(makeIdentity([1, 2, 3, 4])).toEqual(before)
    } finally {
      window.history.replaceState(null, '', '/')
      localStorage.clear()
    }
  })
  it('generates bounded geometry with valid edges for varied seeds', () => {
    for (let i = 0; i < 50; i++) {
      const art = makeIdentity(randomSeed())
      expect(art.points).toHaveLength(32)
      expect(art.dots.length).toBeLessThan(100000)
      for (const edge of art.edges)
        for (const index of edge) expect(art.points[index]).toBeDefined()
    }
  })
})
