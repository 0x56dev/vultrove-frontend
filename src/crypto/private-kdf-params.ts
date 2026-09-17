import { base64UrlEncode, base64UrlDecode } from './base64url'
import {
  encodeField,
  encodeStructure,
  canonicalInteger,
} from './private-encoding'

/**
 * The `kdfVersion: 1` Argon2id parameter profile and its canonical
 * `kdf.params` wire encoding (docs/PRIVATE_ENVELOPE.md §14) — pure
 * constants and comparison logic, **no `hash-wasm` (or any other crypto
 * library) import anywhere in this file or its own imports**. This
 * split exists specifically so structural envelope validation
 * (`./private-envelope-validation.ts`, used by both the browser and the
 * server) can verify a presented `kdf.params` value against the
 * expected encoding **without pulling an Argon2id implementation into
 * whatever process imports it** — most importantly, the Node server
 * process, which must never import/instantiate the WASM Argon2id
 * implementation at all (it never invokes Argon2 for Private mode; see
 * `./private-kdf.ts`, which is the client-only file that actually calls
 * `hash-wasm` and which the server never imports).
 */

/**
 * RFC 9106 Argon2id, algorithm version 0x13 (19), m=19456 KiB, t=2, p=1,
 * output=32 bytes (docs/PRIVATE_ENVELOPE.md §14). **Fixed and hard-coded
 * — never read from an untrusted envelope.** A future parameter change
 * requires a new `kdfVersion`, never a silent edit to these constants
 * (existing `kdfVersion: 1` troves must remain decryptable under exactly
 * these values forever).
 */
export const KDF_V1_MEMORY_SIZE_KIB = 19456
export const KDF_V1_ITERATIONS = 2
export const KDF_V1_PARALLELISM = 1
export const KDF_V1_OUTPUT_LENGTH_BYTES = 32

/**
 * The canonical `kdf.params` byte encoding for kdfVersion 1
 * (docs/PRIVATE_ENVELOPE.md §14): three length-prefixed canonical-
 * integer-string fields, in this exact order — `m`, `t`, `p`. Decodes to
 * exactly 19 bytes:
 * `00 00 00 05 31 39 34 35 36  00 00 00 01 32  00 00 00 01 31`
 * (4-byte length + "19456", then 4-byte length + "2", then 4-byte
 * length + "1") — see `private-kdf-params.test.ts` for this exact
 * vector.
 */
export const KDF_V1_PARAMS_BYTES: Uint8Array = encodeStructure([
  encodeField(canonicalInteger(KDF_V1_MEMORY_SIZE_KIB)),
  encodeField(canonicalInteger(KDF_V1_ITERATIONS)),
  encodeField(canonicalInteger(KDF_V1_PARALLELISM)),
])

/** The base64url wire representation of `KDF_V1_PARAMS_BYTES` — the
 * exact value a well-formed `kdfVersion: 1` envelope's `kdf.params`
 * field must equal. */
export const KDF_V1_PARAMS_BASE64URL: string =
  base64UrlEncode(KDF_V1_PARAMS_BYTES)

/**
 * Verifies that a presented `kdf.params` string matches the expected
 * canonical encoding for `(kdf.id: "argon2id", kdf.kdfVersion: 1)`
 * **exactly** — never a range or sanity-bound check. For a recognized
 * version there is exactly one valid byte sequence, so there is nothing
 * for an attacker-supplied envelope to tune. Returns `false` for
 * anything that fails to decode as base64url or doesn't match
 * byte-for-byte; never throws. This function alone — no Argon2id call —
 * is sufficient for the server's structural validation duty; running
 * Argon2id itself (`./private-kdf.ts`'s `deriveKekV1`) is a client-only
 * operation this function never performs or requires.
 */
export function isValidKdfParamsV1(presented: string): boolean {
  const decoded = base64UrlDecode(presented)
  if (decoded === null || decoded.length !== KDF_V1_PARAMS_BYTES.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < decoded.length; i++) {
    diff |= (decoded[i] ?? 0) ^ (KDF_V1_PARAMS_BYTES[i] ?? 0)
  }
  return diff === 0
}
