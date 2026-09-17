import { describe, it, expect } from 'vitest'
import {
  parsePrivateEnvelope,
  MAX_ENVELOPE_BYTES,
} from './private-envelope-validation'
import { KDF_V1_PARAMS_BYTES } from './private-kdf-params'
import { base64UrlEncode } from './base64url'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'

describe('parsePrivateEnvelope: negative vectors (docs/PRIVATE_ENVELOPE.md §19/§20)', () => {
  const validPlain = {
    v: 1,
    alg: 'AES-256-GCM',
    mode: 'plain',
    nonce: base64UrlEncode(new Uint8Array(12)),
    ciphertext: base64UrlEncode(new Uint8Array(16)),
  }
  const validPassword = {
    ...validPlain,
    mode: 'password',
    kdf: {
      id: 'argon2id',
      kdfVersion: 1,
      params: base64UrlEncode(KDF_V1_PARAMS_BYTES),
    },
    wrappedKey: {
      alg: 'AES-256-GCM',
      nonce: base64UrlEncode(new Uint8Array(12)),
      ciphertext: base64UrlEncode(new Uint8Array(48)),
    },
  }

  it('accepts a well-formed plain envelope', () => {
    expect(() => parsePrivateEnvelope(JSON.stringify(validPlain))).not.toThrow()
  })

  it('accepts a well-formed password envelope', () => {
    expect(() =>
      parsePrivateEnvelope(JSON.stringify(validPassword)),
    ).not.toThrow()
  })

  it('rejects invalid JSON', () => {
    expect(() => parsePrivateEnvelope('{not json')).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects a non-object top-level value (array, string, number, null)', () => {
    expect(() => parsePrivateEnvelope('[]')).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => parsePrivateEnvelope('"a string"')).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => parsePrivateEnvelope('42')).toThrow(
      PrivateEnvelopeValidationError,
    )
    expect(() => parsePrivateEnvelope('null')).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects an unrecognized envelope version', () => {
    expect(() =>
      parsePrivateEnvelope(JSON.stringify({ ...validPlain, v: 2 })),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an unrecognized alg', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({ ...validPlain, alg: 'ChaCha20-Poly1305' }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an unrecognized mode', () => {
    expect(() =>
      parsePrivateEnvelope(JSON.stringify({ ...validPlain, mode: 'public' })),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects a wrong-length nonce', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPlain,
          nonce: base64UrlEncode(new Uint8Array(11)),
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects non-base64url ciphertext', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({ ...validPlain, ciphertext: 'not base64url!!' }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects a missing kdf object for password mode', () => {
    const withoutKdf: Record<string, unknown> = { ...validPassword }
    delete withoutKdf.kdf
    expect(() => parsePrivateEnvelope(JSON.stringify(withoutKdf))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects a missing wrappedKey object for password mode', () => {
    const withoutWrappedKey: Record<string, unknown> = { ...validPassword }
    delete withoutWrappedKey.wrappedKey
    expect(() =>
      parsePrivateEnvelope(JSON.stringify(withoutWrappedKey)),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an unrecognized kdf.id', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          kdf: { ...validPassword.kdf, id: 'pbkdf2-hmac-sha256' },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an unrecognized kdf.kdfVersion for a recognized kdf.id, before kdf.params is ever inspected', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          kdf: { ...validPassword.kdf, kdfVersion: 2 },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects kdf.params that does not exactly match the expected kdfVersion 1 encoding (tuned parameters)', () => {
    const tuned = base64UrlEncode(new Uint8Array(19).fill(0x41)) // wrong bytes, same length
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          kdf: { ...validPassword.kdf, params: tuned },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects kdf.params of the wrong decoded length', () => {
    const wrongLength = base64UrlEncode(new Uint8Array(10))
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          kdf: { ...validPassword.kdf, params: wrongLength },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an unrecognized wrappedKey.alg', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          wrappedKey: { ...validPassword.wrappedKey, alg: 'ChaCha20-Poly1305' },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects a wrong-length wrappedKey.nonce', () => {
    expect(() =>
      parsePrivateEnvelope(
        JSON.stringify({
          ...validPassword,
          wrappedKey: {
            ...validPassword.wrappedKey,
            nonce: base64UrlEncode(new Uint8Array(11)),
          },
        }),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects an envelope exceeding the 2 MiB serialized ceiling, before attempting JSON.parse', () => {
    // Deliberately not valid JSON either — proves the size check runs
    // first (the thrown message names the byte ceiling, not "not valid
    // JSON," which is what a parse-first implementation would report).
    const oversized = 'x'.repeat(MAX_ENVELOPE_BYTES + 1)
    let error: unknown
    try {
      parsePrivateEnvelope(oversized)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PrivateEnvelopeValidationError)
    expect((error as Error).message).toMatch(/2097152|ceiling/i)
  })

  it('accepts a well-formed envelope at exactly the 2 MiB ceiling', () => {
    // Pad ciphertext (with valid base64url characters) so the whole
    // serialized envelope lands exactly at the limit, using a
    // syntactically valid plain envelope. This deliberately-padded
    // ciphertext isn't meaningful AES-GCM output, but it's valid
    // base64url text of the right shape, so structural validation alone
    // should accept it (decryption, tested elsewhere, is what would
    // reject it for real).
    const base = { ...validPlain, ciphertext: '' }
    const baseLength = JSON.stringify(base).length
    const padded = {
      ...validPlain,
      ciphertext: 'A'.repeat(MAX_ENVELOPE_BYTES - baseLength),
    }
    const raw = JSON.stringify(padded)
    expect(raw.length).toBe(MAX_ENVELOPE_BYTES)
    expect(() => parsePrivateEnvelope(raw)).not.toThrow()
  })
})
