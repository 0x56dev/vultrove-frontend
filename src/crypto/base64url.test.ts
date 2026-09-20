import { describe, it, expect } from 'vitest'
import { base64UrlEncode, base64UrlDecode } from './base64url'

describe('base64UrlEncode/base64UrlDecode', () => {
  it('round-trips arbitrary byte arrays', () => {
    for (const length of [0, 1, 2, 3, 4, 16, 22, 32, 43, 100]) {
      const bytes = new Uint8Array(length)
      crypto.getRandomValues(bytes)
      const encoded = base64UrlEncode(bytes)
      const decoded = base64UrlDecode(encoded)
      expect(decoded).not.toBeNull()
      expect(Array.from(decoded!)).toEqual(Array.from(bytes))
    }
  })

  it('never emits padding or non-url-safe characters', () => {
    const bytes = new Uint8Array([255, 255, 255, 255, 255])
    const encoded = base64UrlEncode(bytes)
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })

  it('rejects malformed base64url text without throwing', () => {
    expect(base64UrlDecode('not valid base64!!')).toBeNull()
    expect(base64UrlDecode('a')).toBeNull() // length % 4 === 1 is impossible
    expect(base64UrlDecode('has spaces')).toBeNull()
    expect(base64UrlDecode('has+plus')).toBeNull()
    expect(base64UrlDecode('has/slash')).toBeNull()
    expect(base64UrlDecode('has=pad')).toBeNull()
  })

  it('rejects non-canonical encodings with non-zero unused padding bits', () => {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    // Each length exercises a different remainder: 1 byte leaves 4 unused
    // bits in the final character, 2 bytes leave 2, and 32 bytes leave 2.
    for (const length of [1, 2, 32]) {
      const original = new Uint8Array(length).fill(0xff)
      const canonical = base64UrlEncode(original)
      const unusedBits = length % 3 === 1 ? 4 : 2
      const finalIndex = alphabet.indexOf(canonical.at(-1)!)
      expect(finalIndex % (1 << unusedBits)).toBe(0)

      for (let alias = 1; alias < 1 << unusedBits; alias++) {
        const aliased = canonical.slice(0, -1) + alphabet[finalIndex + alias]
        expect(base64UrlDecode(aliased)).toBeNull()
      }
      expect(base64UrlDecode(canonical)).toEqual(original)
    }
  })

  it('decodes an empty string to an empty array', () => {
    const decoded = base64UrlDecode('')
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(0)
  })
})
