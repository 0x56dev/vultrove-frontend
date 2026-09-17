import { base64UrlDecode } from './base64url'

/**
 * Management-secret verifier boundary (docs/THREAT_MODEL.md §9,
 * docs/API_CONTRACT.md §2.3). Implemented entirely on the Web Crypto API
 * (`crypto.getRandomValues`, `crypto.subtle`) rather than a Node-specific
 * crypto module, matching docs/V0.1_SPEC.md §16's "native WebCrypto, never
 * hand-rolled" requirement and keeping this code portable across browser,
 * Node, and Workers runtimes ahead of the still-open hosting decision.
 *
 * A `ManagementVerifier` (the 32-byte HMAC-SHA-256 output) is a `Uint8Array`
 * — structurally distinct from the `string`-typed raw secret — precisely so
 * it cannot be passed anywhere a presentable credential is expected. There
 * is no function in this module that turns a verifier back into something
 * that would authenticate a request; the boundary is one-directional by
 * construction.
 */
export type ManagementVerifier = Uint8Array<ArrayBuffer>
export type Pepper = Uint8Array<ArrayBuffer>

// docs/THREAT_MODEL.md §9: the management secret is a 256-bit value.
const MANAGEMENT_SECRET_BYTES = 32

// docs/THREAT_MODEL.md §9: the pepper must be at least 256 bits.
const MIN_PEPPER_BYTES = 32

/**
 * Generates a fresh, random pepper suitable for local development and
 * tests. docs/THREAT_MODEL.md §9 requires the pepper to live in deployment
 * secret/configuration storage in a real deployment — this function is not
 * that storage; a real deployment must supply its own pepper bytes (e.g.
 * loaded from a secret binding) to `StandardTroveService` rather than
 * calling this.
 */
export function generatePepper(): Pepper {
  const bytes = new Uint8Array(MIN_PEPPER_BYTES)
  crypto.getRandomValues(bytes)
  return bytes
}

async function hmacSha256(
  key: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message)
  return new Uint8Array(signature)
}

/**
 * Fixed-time equality check for two equal-length byte arrays
 * (docs/THREAT_MODEL.md §9: "a constant-time comparison ... never a
 * short-circuiting compare"). Both verifier and freshly-computed HMAC
 * output are always exactly 32 bytes by construction, so the length check
 * itself never carries information about a real secret's validity.
 */
function constantTimeEqual(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>,
): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

/**
 * Decodes and validates a presented management secret's *shape* only (valid
 * base64url, decodes to exactly 32 bytes) without checking it against any
 * stored verifier. Returns `null` for anything malformed. Used at
 * enrollment (create) time, where there is no existing verifier yet to
 * check against — see docs/API_CONTRACT.md §2.3.
 */
export function decodeManagementSecret(
  presented: string,
): Uint8Array<ArrayBuffer> | null {
  const decoded = base64UrlDecode(presented)
  if (decoded === null || decoded.length !== MANAGEMENT_SECRET_BYTES) {
    return null
  }
  return decoded
}

/**
 * Computes the HMAC-SHA-256 verifier for a freshly-presented management
 * secret, over its decoded 32 raw bytes — never the base64url text
 * (docs/THREAT_MODEL.md §9). Returns `null` if the secret is malformed
 * (fails to decode, or doesn't decode to exactly 32 bytes) rather than
 * throwing, so callers can treat "malformed" uniformly.
 */
export async function computeManagementVerifier(
  presentedSecret: string,
  pepper: Pepper,
): Promise<ManagementVerifier | null> {
  const decoded = decodeManagementSecret(presentedSecret)
  if (decoded === null) {
    return null
  }
  return hmacSha256(pepper, decoded)
}

/**
 * Verifies a presented management secret against a stored verifier.
 * docs/THREAT_MODEL.md §9: a secret that fails to decode, decodes to the
 * wrong length, or simply doesn't match must all produce the identical
 * (`false`) result — never a thrown error distinguishable from a boolean
 * mismatch — so callers cannot accidentally leak which case occurred.
 */
export async function verifyManagementSecret(
  presentedSecret: string,
  storedVerifier: ManagementVerifier,
  pepper: Pepper,
): Promise<boolean> {
  const decoded = decodeManagementSecret(presentedSecret)
  if (decoded === null) {
    return false
  }
  const computed = await hmacSha256(pepper, decoded)
  return constantTimeEqual(computed, storedVerifier)
}
