import { describe, it, expect } from 'vitest'
import { toWireDescription, toWireLinks, toWirePassword } from './to-wire'
import { createInitialValues } from './initial-values'
import type { TroveFormValues } from './types'

function baseValues(overrides: Partial<TroveFormValues> = {}): TroveFormValues {
  return { ...createInitialValues('link-0'), ...overrides }
}

describe('toWireDescription', () => {
  it('maps a blank description to null', () => {
    expect(toWireDescription('')).toBeNull()
    expect(toWireDescription('   ')).toBeNull()
  })

  it('passes a non-blank description through unchanged', () => {
    expect(toWireDescription('hello')).toBe('hello')
  })
})

describe('toWireLinks', () => {
  it('maps a blank label to null', () => {
    const values = baseValues({
      links: [{ id: 'a', url: 'https://example.com', label: '  ' }],
    })
    expect(toWireLinks(values)).toEqual([
      { url: 'https://example.com', label: null },
    ])
  })

  it('passes a non-blank label through unchanged', () => {
    const values = baseValues({
      links: [{ id: 'a', url: 'https://example.com', label: 'A label' }],
    })
    expect(toWireLinks(values)).toEqual([
      { url: 'https://example.com', label: 'A label' },
    ])
  })
})

describe('toWirePassword', () => {
  it('returns {enabled:false} when protection is off', () => {
    const values = baseValues({ passwordEnabled: false, password: '' })
    expect(toWirePassword(values)).toEqual({ enabled: false })
  })

  it('returns {enabled:false} when protection is off even if a stray password value is present', () => {
    const values = baseValues({ passwordEnabled: false, password: 'leftover' })
    expect(toWirePassword(values)).toEqual({ enabled: false })
  })

  it('returns {enabled:true, value} when protection is on with a value', () => {
    const values = baseValues({ passwordEnabled: true, password: 'hunter2' })
    expect(toWirePassword(values)).toEqual({ enabled: true, value: 'hunter2' })
  })

  it('without omitWhenUnchanged, a blank value while enabled is sent as an empty password rather than omitted', () => {
    // The create form's own validation never lets this state reach
    // submission, but toWirePassword itself makes no assumption about
    // that — this documents the create-mode default behavior explicitly.
    const values = baseValues({ passwordEnabled: true, password: '' })
    expect(toWirePassword(values)).toEqual({ enabled: true, value: '' })
  })

  it('with omitWhenUnchanged, a blank value while enabled is omitted (undefined) — "keep unchanged"', () => {
    const values = baseValues({ passwordEnabled: true, password: '' })
    expect(toWirePassword(values, { omitWhenUnchanged: true })).toBeUndefined()
  })

  it('with omitWhenUnchanged, a non-blank value while enabled is still sent as a replacement', () => {
    const values = baseValues({ passwordEnabled: true, password: 'new-pw' })
    expect(toWirePassword(values, { omitWhenUnchanged: true })).toEqual({
      enabled: true,
      value: 'new-pw',
    })
  })

  it('with omitWhenUnchanged, disabling protection still returns {enabled:false} (removal), never omitted', () => {
    const values = baseValues({ passwordEnabled: false, password: '' })
    expect(toWirePassword(values, { omitWhenUnchanged: true })).toEqual({
      enabled: false,
    })
  })
})
