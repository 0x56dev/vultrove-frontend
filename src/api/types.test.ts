import { describe, it, expect } from 'vitest'
import { isLockedTroveView } from './types'
import type { PublicStandardTroveViewBody } from './types'

describe('isLockedTroveView', () => {
  it('returns true for the locked shape (no title)', () => {
    const locked: PublicStandardTroveViewBody = {
      mode: 'standard',
      passwordProtected: true,
      expiresAt: null,
    }
    expect(isLockedTroveView(locked)).toBe(true)
  })

  it('returns false for the full-content shape, even when passwordProtected is true', () => {
    const unlocked: PublicStandardTroveViewBody = {
      mode: 'standard',
      title: 'A trove',
      description: null,
      links: [],
      expiresAt: null,
      passwordProtected: true,
    }
    expect(isLockedTroveView(unlocked)).toBe(false)
  })

  it('returns false for the unprotected shape', () => {
    const unprotected: PublicStandardTroveViewBody = {
      mode: 'standard',
      title: 'A trove',
      description: null,
      links: [],
      expiresAt: null,
      passwordProtected: false,
    }
    expect(isLockedTroveView(unprotected)).toBe(false)
  })
})
