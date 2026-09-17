import { describe, it, expect } from 'vitest'
import {
  KDF_V1_PARAMS_BYTES,
  KDF_V1_PARAMS_BASE64URL,
  isValidKdfParamsV1,
} from './private-kdf-params'
import { base64UrlEncode } from './base64url'

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

describe('KDF_V1_PARAMS_BYTES', () => {
  it("matches docs/PRIVATE_ENVELOPE.md §14's exact 19-byte vector for m=19456,t=2,p=1", () => {
    expect(KDF_V1_PARAMS_BYTES.length).toBe(19)
    expect(hex(KDF_V1_PARAMS_BYTES)).toBe(
      '00 00 00 05 31 39 34 35 36 00 00 00 01 32 00 00 00 01 31',
    )
  })

  it('base64url-encodes without padding', () => {
    expect(KDF_V1_PARAMS_BASE64URL).toBe(base64UrlEncode(KDF_V1_PARAMS_BYTES))
    expect(KDF_V1_PARAMS_BASE64URL).not.toMatch(/[=+/]/)
  })
})

describe('isValidKdfParamsV1', () => {
  it('accepts the exact canonical value', () => {
    expect(isValidKdfParamsV1(KDF_V1_PARAMS_BASE64URL)).toBe(true)
  })

  it('rejects malformed base64url', () => {
    expect(isValidKdfParamsV1('not valid base64url!!')).toBe(false)
  })

  it('rejects a value of the wrong decoded length', () => {
    expect(isValidKdfParamsV1(base64UrlEncode(new Uint8Array(18)))).toBe(false)
    expect(isValidKdfParamsV1(base64UrlEncode(new Uint8Array(20)))).toBe(false)
  })

  it('rejects a same-length value that differs by a single byte (e.g. a tuned m/t/p)', () => {
    const tampered = new Uint8Array(KDF_V1_PARAMS_BYTES)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff // flip the last byte ("1" for p)
    expect(isValidKdfParamsV1(base64UrlEncode(tampered))).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(isValidKdfParamsV1('')).toBe(false)
  })
})
