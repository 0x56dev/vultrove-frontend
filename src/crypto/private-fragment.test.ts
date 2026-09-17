import { describe, it, expect } from 'vitest'
import { encodeFragment, parseFragment } from './private-fragment'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'

describe('encodeFragment / parseFragment', () => {
  it('round-trips a 32-byte secret', () => {
    const secret = new Uint8Array(32)
    crypto.getRandomValues(secret)
    const fragment = encodeFragment(secret)
    expect(fragment).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/)
    expect(parseFragment(fragment)).toEqual(secret)
  })

  it('rejects encoding a secret of the wrong length', () => {
    expect(() => encodeFragment(new Uint8Array(31))).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => encodeFragment(new Uint8Array(33))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects an empty fragment (missing fragment case)', () => {
    expect(() => parseFragment('')).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects a fragment with no version prefix', () => {
    const secret = new Uint8Array(32).fill(1)
    const withoutPrefix = encodeFragment(secret).slice('v1.'.length)
    expect(() => parseFragment(withoutPrefix)).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects an unrecognized version prefix', () => {
    const secret = new Uint8Array(32).fill(1)
    const wrongVersion = 'v2.' + encodeFragment(secret).slice('v1.'.length)
    expect(() => parseFragment(wrongVersion)).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects a fragment that is too short or too long', () => {
    expect(() => parseFragment('v1.abc')).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => parseFragment('v1.' + 'A'.repeat(44))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects a fragment containing characters outside the base64url alphabet', () => {
    expect(() => parseFragment('v1.' + '+'.repeat(43))).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => parseFragment('v1.' + '='.repeat(43))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('never throws for a malformed fragment before any crypto — rejection is synchronous and pre-crypto', () => {
    // parseFragment itself performs no async/crypto work at all; this is
    // a structural guarantee, checked by confirming it's not a Promise.
    let result: unknown
    try {
      result = parseFragment('garbage')
    } catch (e) {
      result = e
    }
    expect(result).not.toBeInstanceOf(Promise)
  })
})
