import { base64UrlDecode } from './base64url'
import { isValidKdfParamsV1 } from './private-kdf-params'
import type { PrivateEnvelope } from './private-trove'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'

/**
 * Structural validation of the Private Trove envelope
 * (docs/PRIVATE_ENVELOPE.md §19/§20) — **zero cryptographic operations,
 * and zero import of any crypto library**, by design: this file (unlike
 * `./private-envelope.ts` and `./private-kdf.ts`) is safe to import from
 * **either** the browser or the Node server process. The server's
 * entire Private-mode responsibility is exactly what this file provides
 * — parse, validate shape/size/enum values, store/return the opaque
 * result — and it must never import `./private-envelope.ts` or
 * `./private-kdf.ts` (which pull in `hash-wasm`/WASM Argon2id and
 * perform actual AES-GCM/KDF operations) to do it. `isValidKdfParamsV1`
 * is imported from `./private-kdf-params.ts` specifically because that
 * file, too, has no crypto-library dependency — it only ever *compares*
 * bytes, never invokes Argon2id.
 */

export const ENVELOPE_VERSION = 1 as const
export const RECOGNIZED_ALG = 'AES-256-GCM' as const
export const RECOGNIZED_KDF_ID = 'argon2id' as const
export const RECOGNIZED_KDF_VERSION = 1 as const
export const NONCE_BYTES = 12

/** docs/PRIVATE_ENVELOPE.md §20: the ceiling on the serialized envelope
 * as transmitted/stored — checked on raw byte length, before any JSON
 * parsing. */
export const MAX_ENVELOPE_BYTES = 2_097_152

export function mustDecodeBase64Url(
  value: string,
  fieldName: string,
): Uint8Array {
  const decoded = base64UrlDecode(value)
  if (decoded === null) {
    throw new PrivateEnvelopeValidationError(
      `${fieldName} is not valid base64url.`,
    )
  }
  return decoded
}

export function mustDecodeFixedLength(
  value: string,
  expectedLength: number,
  fieldName: string,
): Uint8Array {
  const decoded = mustDecodeBase64Url(value, fieldName)
  if (decoded.length !== expectedLength) {
    throw new PrivateEnvelopeValidationError(
      `${fieldName} must decode to exactly ${expectedLength} bytes (got ${decoded.length}).`,
    )
  }
  return decoded
}

/** Validates an *already-typed* `PrivateEnvelope` value's serialized
 * size — used by `createPrivateEnvelope` right after building a fresh
 * envelope, and reusable by any caller re-serializing one for storage. */
export function assertEnvelopeSizeWithinLimit(envelope: PrivateEnvelope): void {
  const byteLength = new TextEncoder().encode(JSON.stringify(envelope)).length
  if (byteLength > MAX_ENVELOPE_BYTES) {
    throw new PrivateEnvelopeValidationError(
      `Serialized envelope exceeds the ${MAX_ENVELOPE_BYTES}-byte ceiling (got ${byteLength} bytes).`,
    )
  }
}

/**
 * docs/PRIVATE_ENVELOPE.md §19/§20: structural validation of an
 * untrusted envelope, from raw JSON text (so the byte-length ceiling can
 * be checked *before* `JSON.parse`, per §20) through to a fully-typed
 * `PrivateEnvelope`. Rejects unrecognized `v`/`alg`/`mode`/`kdf.id`/
 * `kdf.kdfVersion` — including any `kdf.kdfVersion` other than `1` for a
 * recognized `kdf.id`, checked **before** `kdf.params` is decoded or
 * matched, and (structurally, by never invoking it at all from this
 * file) before Argon2id could ever be invoked — and wrong-length binary
 * fields, all before any cryptographic operation could possibly run.
 * This is the single entry point through which untrusted envelope text
 * — whether in a browser about to decrypt, or the server about to store
 * it opaquely — should ever become a `PrivateEnvelope` value.
 */
export function parsePrivateEnvelope(raw: string): PrivateEnvelope {
  const byteLength = new TextEncoder().encode(raw).length
  if (byteLength > MAX_ENVELOPE_BYTES) {
    throw new PrivateEnvelopeValidationError(
      `Serialized envelope exceeds the ${MAX_ENVELOPE_BYTES}-byte ceiling (got ${byteLength} bytes).`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new PrivateEnvelopeValidationError('Envelope is not valid JSON.')
  }

  return validateEnvelopeShape(parsed)
}

function validateEnvelopeShape(value: unknown): PrivateEnvelope {
  if (typeof value !== 'object' || value === null) {
    throw new PrivateEnvelopeValidationError('Envelope must be an object.')
  }
  const env = value as Record<string, unknown>

  if (env.v !== ENVELOPE_VERSION) {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized envelope version: ${JSON.stringify(env.v)}.`,
    )
  }
  if (env.alg !== RECOGNIZED_ALG) {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized envelope alg: ${JSON.stringify(env.alg)}.`,
    )
  }
  if (env.mode !== 'plain' && env.mode !== 'password') {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized envelope mode: ${JSON.stringify(env.mode)}.`,
    )
  }
  if (typeof env.nonce !== 'string') {
    throw new PrivateEnvelopeValidationError('nonce must be a string.')
  }
  mustDecodeFixedLength(env.nonce, NONCE_BYTES, 'nonce')
  if (typeof env.ciphertext !== 'string') {
    throw new PrivateEnvelopeValidationError('ciphertext must be a string.')
  }
  mustDecodeBase64Url(env.ciphertext, 'ciphertext')

  if (env.mode === 'plain') {
    return {
      v: ENVELOPE_VERSION,
      alg: RECOGNIZED_ALG,
      mode: 'plain',
      nonce: env.nonce,
      ciphertext: env.ciphertext,
    }
  }

  if (typeof env.kdf !== 'object' || env.kdf === null) {
    throw new PrivateEnvelopeValidationError('kdf must be an object.')
  }
  const kdf = env.kdf as Record<string, unknown>
  if (kdf.id !== RECOGNIZED_KDF_ID) {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized kdf.id: ${JSON.stringify(kdf.id)}.`,
    )
  }
  if (kdf.kdfVersion !== RECOGNIZED_KDF_VERSION) {
    // Rejected on the version check alone — never passed through to a
    // code path that might otherwise decode/trust kdf.params for an
    // unhandled version (docs/PRIVATE_ENVELOPE.md §19).
    throw new PrivateEnvelopeValidationError(
      `Unrecognized kdf.kdfVersion for kdf.id "argon2id": ${JSON.stringify(kdf.kdfVersion)}.`,
    )
  }
  if (typeof kdf.params !== 'string') {
    throw new PrivateEnvelopeValidationError('kdf.params must be a string.')
  }
  if (!isValidKdfParamsV1(kdf.params)) {
    throw new PrivateEnvelopeValidationError(
      'kdf.params does not match the expected kdfVersion 1 encoding.',
    )
  }

  if (typeof env.wrappedKey !== 'object' || env.wrappedKey === null) {
    throw new PrivateEnvelopeValidationError('wrappedKey must be an object.')
  }
  const wrappedKey = env.wrappedKey as Record<string, unknown>
  if (wrappedKey.alg !== RECOGNIZED_ALG) {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized wrappedKey.alg: ${JSON.stringify(wrappedKey.alg)}.`,
    )
  }
  if (typeof wrappedKey.nonce !== 'string') {
    throw new PrivateEnvelopeValidationError(
      'wrappedKey.nonce must be a string.',
    )
  }
  mustDecodeFixedLength(wrappedKey.nonce, NONCE_BYTES, 'wrappedKey.nonce')
  if (typeof wrappedKey.ciphertext !== 'string') {
    throw new PrivateEnvelopeValidationError(
      'wrappedKey.ciphertext must be a string.',
    )
  }
  mustDecodeBase64Url(wrappedKey.ciphertext, 'wrappedKey.ciphertext')

  return {
    v: ENVELOPE_VERSION,
    alg: RECOGNIZED_ALG,
    mode: 'password',
    nonce: env.nonce,
    ciphertext: env.ciphertext,
    kdf: { id: 'argon2id', kdfVersion: 1, params: kdf.params },
    wrappedKey: {
      alg: RECOGNIZED_ALG,
      nonce: wrappedKey.nonce,
      ciphertext: wrappedKey.ciphertext,
    },
  }
}
