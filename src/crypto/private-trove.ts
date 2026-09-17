import type { Link } from './trove'

/**
 * Private Trove envelope/content types (docs/PRIVATE_ENVELOPE.md §2,
 * §11, §12). Unlike `./trove.ts`'s Standard types, nothing here is
 * server-authoritative content: a Private trove's title/description/
 * links exist in plaintext only transiently inside a browser tab. Every
 * `private-*` module in this directory runs client-side only — the
 * server never calls any function that touches plaintext, key material,
 * or a password for Private Troves.
 *
 * The trove ID is deliberately *not* a field of either type below — it
 * is public, non-secret routing metadata supplied externally by the
 * caller (the URL path / the server record), authenticated via AAD
 * rather than encrypted or embedded in the envelope JSON
 * (docs/PRIVATE_ENVELOPE.md §4a).
 */

/** docs/PRIVATE_ENVELOPE.md §2: the canonical plaintext JSON encrypted
 * as "content" — the only thing AES-256-GCM ever encrypts here. */
export interface PrivateContentPlaintext {
  schemaVersion: 1
  title: string
  description: string | null
  links: Link[]
}

/** docs/PRIVATE_ENVELOPE.md §11: a Private Trove with no password. */
export interface PrivateEnvelopePlain {
  v: 1
  alg: 'AES-256-GCM'
  mode: 'plain'
  /** base64url, 12 bytes decoded. */
  nonce: string
  /** base64url, content ciphertext with the 128-bit GCM tag appended. */
  ciphertext: string
}

/** docs/PRIVATE_ENVELOPE.md §12/§14: a password-protected Private Trove.
 * No `kdf.salt` field exists — the salt is the fragment secret, held
 * only in the URL fragment, never server-stored (see `./private-kdf.ts`). */
export interface PrivateEnvelopePassword {
  v: 1
  alg: 'AES-256-GCM'
  mode: 'password'
  nonce: string
  ciphertext: string
  kdf: {
    id: 'argon2id'
    kdfVersion: 1
    /** base64url encoding of the canonical kdf.params byte structure
     * (docs/PRIVATE_ENVELOPE.md §14) — for kdfVersion 1, always exactly
     * `KDF_V1_PARAMS_BASE64URL` from `./private-kdf.ts`. */
    params: string
  }
  wrappedKey: {
    alg: 'AES-256-GCM'
    nonce: string
    /** base64url, wrapped 32-byte content key with the 128-bit GCM tag
     * appended. */
    ciphertext: string
  }
}

export type PrivateEnvelope = PrivateEnvelopePlain | PrivateEnvelopePassword
