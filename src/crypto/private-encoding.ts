/**
 * Canonical byte encoding for Private Trove AAD construction and
 * `kdf.params` (docs/PRIVATE_ENVELOPE.md §5/6, §10, §14). Every value
 * requiring byte-exact, implementation-independent representation goes
 * through `encodeField`/`encodeFieldBytes` — never `JSON.stringify`,
 * never object-key order, never locale-dependent number formatting.
 * This is the primitive both the encryptor and the decryptor use to
 * *reconstruct* AAD identically; AAD itself is never transmitted or
 * stored as its own field.
 */

const textEncoder = new TextEncoder()

/** docs/PRIVATE_ENVELOPE.md §5/6: uint32_BE(len(bytes)) || bytes. */
export function encodeFieldBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.length)
  new DataView(out.buffer).setUint32(0, bytes.length, false)
  out.set(bytes, 4)
  return out
}

/** `encodeField` for a string-typed canonical value (a fixed enum
 * literal, a canonical integer string, or an already-base64url ID) —
 * UTF-8 encoded, then length-prefixed. */
export function encodeField(value: string): Uint8Array {
  return encodeFieldBytes(textEncoder.encode(value))
}

/**
 * The canonical non-negative-integer string form (§5/6): shortest
 * base-10 ASCII digits, no leading zeros, no leading `+`, no sign, no
 * surrounding whitespace. Throws on anything that isn't a non-negative
 * safe integer — there is no canonical form for such a value, so
 * silently coercing one would be a correctness bug waiting to happen,
 * not a permissive convenience.
 */
export function canonicalInteger(value: number): string {
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new RangeError(
      `Expected a non-negative safe integer, got ${JSON.stringify(value)}.`,
    )
  }
  return String(value)
}

/**
 * A "structure" (§5/6): the concatenation of `encodeField(...)`/
 * `encodeFieldBytes(...)` outputs, in the fixed order the caller
 * supplies — order is part of the specification at each call site, not
 * a serialization implementation detail.
 */
export function encodeStructure(fields: readonly Uint8Array[]): Uint8Array {
  const total = fields.reduce((sum, field) => sum + field.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const field of fields) {
    out.set(field, offset)
    offset += field.length
  }
  return out
}

const CONTENT_AAD_DOMAIN = 'vultrove.private-trove.content'
const WRAP_AAD_DOMAIN = 'vultrove.private-trove.wrap'

/**
 * docs/PRIVATE_ENVELOPE.md §10: content AAD, for the top-level
 * `nonce`/`ciphertext` pair — fixed field order: domain literal, `v`,
 * trove ID, `alg`, `mode`.
 */
export function buildContentAad(params: {
  v: number
  troveId: string
  alg: string
  mode: 'plain' | 'password'
}): Uint8Array {
  return encodeStructure([
    encodeField(CONTENT_AAD_DOMAIN),
    encodeField(canonicalInteger(params.v)),
    encodeField(params.troveId),
    encodeField(params.alg),
    encodeField(params.mode),
  ])
}

/**
 * docs/PRIVATE_ENVELOPE.md §10: wrap AAD, for `wrappedKey.nonce`/
 * `wrappedKey.ciphertext` (password mode only) — fixed field order:
 * domain literal, `v`, trove ID, `wrappedKey.alg`, `kdf.id`,
 * `kdf.kdfVersion`, `kdf.params` (the entire canonical-encoded
 * `kdf.params` byte string, itself passed through `encodeFieldBytes` as
 * one opaque field — `kdfParams` here is the *decoded raw bytes*, not
 * the base64url wire text).
 */
export function buildWrapAad(params: {
  v: number
  troveId: string
  wrappedKeyAlg: string
  kdfId: string
  kdfVersion: number
  kdfParams: Uint8Array
}): Uint8Array {
  return encodeStructure([
    encodeField(WRAP_AAD_DOMAIN),
    encodeField(canonicalInteger(params.v)),
    encodeField(params.troveId),
    encodeField(params.wrappedKeyAlg),
    encodeField(params.kdfId),
    encodeField(canonicalInteger(params.kdfVersion)),
    encodeFieldBytes(params.kdfParams),
  ])
}
