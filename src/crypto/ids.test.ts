import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generateTroveId,
  generateManagementId,
  generateManagementSecret,
} from './ids'
import { base64UrlDecode } from './base64url'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('id/secret generation', () => {
  it('generates 128-bit (16-byte) trove IDs as unpadded base64url', () => {
    const id = generateTroveId()
    const decoded = base64UrlDecode(id)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(16)
    expect(id).not.toContain('=')
  })

  it('generates 128-bit (16-byte) management IDs as unpadded base64url', () => {
    const id = generateManagementId()
    const decoded = base64UrlDecode(id)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(16)
  })

  it('generates 256-bit (32-byte) management secrets as unpadded base64url', () => {
    const secret = generateManagementSecret()
    const decoded = base64UrlDecode(secret)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(32)
  })

  /**
   * This is the actual security-relevant assertion: the generators call
   * `crypto.getRandomValues` (the CSPRNG) with a buffer of the documented
   * byte length, rather than `Math.random()`, a counter, or a timestamp.
   * The 128-bit/256-bit collision-resistance property this task asks
   * about is a mathematical consequence of *that* API and *that* byte
   * length (docs/API_CONTRACT.md §2.1/§2.2) — it is not, and cannot be,
   * something a unit test demonstrates by observing a small sample of
   * outputs. A sample too small to ever plausibly collide is expected
   * behavior of a correct CSPRNG and is equally consistent with a broken
   * one; it is not evidence either way, so no test here treats it as such.
   */
  it('generates randomness via crypto.getRandomValues, with the documented byte length', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')

    generateTroveId()
    generateManagementId()
    generateManagementSecret()

    expect(spy).toHaveBeenCalledTimes(3)
    const byteLengths = spy.mock.calls.map(
      (call) => (call[0] as Uint8Array).length,
    )
    expect(byteLengths).toEqual([16, 16, 32])
  })

  /**
   * A small-sample sanity/regression check only — this catches a gross,
   * obvious implementation bug (e.g. a hardcoded value, an all-zero
   * buffer, an accidentally reused fixed seed, or a broken encoder that
   * collapses distinct inputs to the same output). It is deliberately
   * NOT a statistical validation of 128-bit collision resistance or
   * entropy, which no feasible sample size could demonstrate — that
   * property comes from the specified CSPRNG and byte length above, not
   * from this observation.
   */
  it('does not produce an obviously broken/constant value across repeated calls', () => {
    const ids = Array.from({ length: 20 }, () => generateTroveId())
    expect(new Set(ids).size).toBe(ids.length)

    const secrets = Array.from({ length: 20 }, () => generateManagementSecret())
    expect(new Set(secrets).size).toBe(secrets.length)
  })
})
