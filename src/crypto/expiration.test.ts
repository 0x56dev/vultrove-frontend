import { describe, it, expect } from 'vitest'
import {
  computeExpiresAt,
  isExpired,
  isExpirationCode,
  EXPIRATION_DURATION_SECONDS,
  DEFAULT_EXPIRATION_CODE,
} from './expiration'

describe('expiration', () => {
  it('matches the exact documented durations (docs/V0.1_SPEC.md §10)', () => {
    expect(EXPIRATION_DURATION_SECONDS['1h']).toBe(3_600)
    expect(EXPIRATION_DURATION_SECONDS['1d']).toBe(86_400)
    expect(EXPIRATION_DURATION_SECONDS['7d']).toBe(604_800)
    expect(EXPIRATION_DURATION_SECONDS['30d']).toBe(2_592_000)
    expect(EXPIRATION_DURATION_SECONDS['1y']).toBe(31_536_000)
    expect(EXPIRATION_DURATION_SECONDS.never).toBeNull()
  })

  it('defaults to 7d', () => {
    expect(DEFAULT_EXPIRATION_CODE).toBe('7d')
  })

  it('computes an absolute expiry from a fixed duration', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = computeExpiresAt('1h', from)
    expect(expiresAt?.toISOString()).toBe('2026-01-01T01:00:00.000Z')
  })

  it('treats "never" as a sentinel, not a duration', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    expect(computeExpiresAt('never', from)).toBeNull()
  })

  it('is never expired when expiresAt is null', () => {
    expect(isExpired(null, new Date('2100-01-01T00:00:00.000Z'))).toBe(false)
  })

  it('is expired exactly at, and after, the expiry instant', () => {
    const expiresAt = new Date('2026-01-01T00:00:00.000Z')
    expect(isExpired(expiresAt, new Date('2025-12-31T23:59:59.999Z'))).toBe(
      false,
    )
    expect(isExpired(expiresAt, expiresAt)).toBe(true)
    expect(isExpired(expiresAt, new Date('2026-01-01T00:00:00.001Z'))).toBe(
      true,
    )
  })

  it('rejects any code outside the closed set', () => {
    expect(isExpirationCode('1h')).toBe(true)
    expect(isExpirationCode('never')).toBe(true)
    expect(isExpirationCode('2h')).toBe(false)
    expect(isExpirationCode('permanent')).toBe(false)
    expect(isExpirationCode(3600)).toBe(false)
    expect(isExpirationCode(null)).toBe(false)
    expect(isExpirationCode(undefined)).toBe(false)
  })
})
