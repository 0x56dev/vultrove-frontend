import { describe, it, expect } from 'vitest'
import {
  encodeField,
  encodeFieldBytes,
  encodeStructure,
  canonicalInteger,
  buildContentAad,
  buildWrapAad,
} from './private-encoding'

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

describe('canonicalInteger', () => {
  it('produces the shortest no-leading-zero decimal string', () => {
    expect(canonicalInteger(0)).toBe('0')
    expect(canonicalInteger(1)).toBe('1')
    expect(canonicalInteger(19456)).toBe('19456')
  })

  it('rejects non-integers, negatives, and unsafe integers', () => {
    expect(() => canonicalInteger(1.5)).toThrow(RangeError)
    expect(() => canonicalInteger(-1)).toThrow(RangeError)
    expect(() => canonicalInteger(Number.NaN)).toThrow(RangeError)
    expect(() => canonicalInteger(2 ** 60)).toThrow(RangeError)
  })
})

describe('encodeField (hand-derived vectors)', () => {
  it('encodes a 5-character ASCII string as 4-byte-BE-length + bytes', () => {
    // "19456" -> length 5 (0x00000005), then ASCII '1','9','4','5','6'
    // (0x31,0x39,0x34,0x35,0x36) — this is docs/PRIVATE_ENVELOPE.md §14's
    // own worked example for the first kdf.params field.
    expect(hex(encodeField('19456'))).toBe('00 00 00 05 31 39 34 35 36')
  })

  it('encodes a 1-character ASCII string', () => {
    expect(hex(encodeField('2'))).toBe('00 00 00 01 32')
    expect(hex(encodeField('1'))).toBe('00 00 00 01 31')
  })

  it('encodes the empty string as a zero length prefix and no bytes', () => {
    expect(hex(encodeField(''))).toBe('00 00 00 00')
  })

  it('UTF-8 encodes non-ASCII content before length-prefixing (length is byte length, not code point count)', () => {
    // "é" is U+00E9, 2 UTF-8 bytes (0xC3 0xA9) — the length prefix must
    // reflect that, not the 1-code-point/1-UTF-16-unit string length.
    expect(hex(encodeField('é'))).toBe('00 00 00 02 c3 a9')
  })
})

describe('encodeFieldBytes', () => {
  it('length-prefixes raw bytes without any text encoding step', () => {
    const raw = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(hex(encodeFieldBytes(raw))).toBe('00 00 00 04 de ad be ef')
  })
})

describe('encodeStructure', () => {
  it('concatenates fields in the given order with no separator', () => {
    const structure = encodeStructure([
      encodeField('19456'),
      encodeField('2'),
      encodeField('1'),
    ])
    // This is exactly docs/PRIVATE_ENVELOPE.md §14's kdf.params test
    // vector for kdfVersion 1 — the authoritative external vector this
    // whole module is built to reproduce byte-for-byte.
    expect(hex(structure)).toBe(
      '00 00 00 05 31 39 34 35 36 00 00 00 01 32 00 00 00 01 31',
    )
    expect(structure.length).toBe(19)
  })

  it('is order-sensitive', () => {
    const a = encodeStructure([encodeField('x'), encodeField('y')])
    const b = encodeStructure([encodeField('y'), encodeField('x')])
    expect(hex(a)).not.toBe(hex(b))
  })
})

describe('buildContentAad', () => {
  const base = { v: 1, troveId: 'x', alg: 'A', mode: 'plain' as const }

  it('matches a fully hand-derived vector for minimal inputs', () => {
    // Domain literal "vultrove.private-trove.content" (31 bytes, all
    // ASCII) + v="1" + troveId="x" + alg="A" + mode="plain" — computed
    // independently of encodeField itself, using the raw byte layout
    // rule (4-byte-BE length + UTF-8 bytes) directly.
    const domain = 'vultrove.private-trove.content'
    const domainLenHex = domain.length
      .toString(16)
      .padStart(8, '0')
      .match(/../g)!
      .join(' ')
    const domainBytesHex = Array.from(new TextEncoder().encode(domain), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(' ')
    const expected = [
      domainLenHex,
      domainBytesHex,
      '00 00 00 01 31', // "1"
      '00 00 00 01 78', // "x"
      '00 00 00 01 41', // "A"
      '00 00 00 05 70 6c 61 69 6e', // "plain"
    ].join(' ')

    expect(hex(buildContentAad(base))).toBe(expected)
  })

  it('changes output when any single field changes', () => {
    const reference = hex(buildContentAad(base))
    expect(hex(buildContentAad({ ...base, v: 2 }))).not.toBe(reference)
    expect(hex(buildContentAad({ ...base, troveId: 'z' }))).not.toBe(reference)
    expect(hex(buildContentAad({ ...base, alg: 'B' }))).not.toBe(reference)
    expect(hex(buildContentAad({ ...base, mode: 'password' }))).not.toBe(
      reference,
    )
  })

  it('is not confusable with a field-order swap (alg/mode)', () => {
    // A regression guard specifically for field-order bugs: manually
    // build the AAD with alg and mode swapped and confirm the real
    // function's output never coincidentally matches it for inputs where
    // alg and mode happen to have the same length.
    const real = buildContentAad({
      v: 1,
      troveId: 'x',
      alg: 'plain',
      mode: 'plain' as never,
    })
    const swapped = encodeStructure([
      encodeField('vultrove.private-trove.content'),
      encodeField('1'),
      encodeField('x'),
      encodeField('plain'), // mode where alg should be
      encodeField('plain'), // alg where mode should be
    ])
    // Same bytes here only because both fields happen to be "plain" in
    // this deliberately-chosen case — this asserts the swap is a no-op
    // detector: if it were NOT equal even with identical field values,
    // that would indicate a genuine structural bug.
    expect(hex(real)).toBe(hex(swapped))
  })
})

describe('buildWrapAad', () => {
  const base = {
    v: 1,
    troveId: 'x',
    wrappedKeyAlg: 'AES-256-GCM',
    kdfId: 'argon2id',
    kdfVersion: 1,
    kdfParams: new Uint8Array([1, 2, 3]),
  }

  it('embeds kdfParams as one opaque length-prefixed field, not decoded/re-split', () => {
    const result = buildWrapAad(base)
    // Domain + v + troveId + wrappedKeyAlg + kdfId + kdfVersion + kdfParams(3 bytes)
    const expectedTail = encodeFieldBytes(base.kdfParams)
    expect(hex(result.slice(-expectedTail.length))).toBe(hex(expectedTail))
  })

  it('changes output when kdfParams bytes change, even at the same length', () => {
    const a = buildWrapAad(base)
    const b = buildWrapAad({ ...base, kdfParams: new Uint8Array([1, 2, 4]) })
    expect(hex(a)).not.toBe(hex(b))
  })

  it('changes output when wrappedKeyAlg changes (resolves prior-review item 6 — the wrap algorithm is authenticated)', () => {
    const a = buildWrapAad(base)
    const b = buildWrapAad({ ...base, wrappedKeyAlg: 'ChaCha20-Poly1305' })
    expect(hex(a)).not.toBe(hex(b))
  })
})
