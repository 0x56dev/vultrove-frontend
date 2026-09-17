import { base64UrlEncode } from './base64url'

/**
 * Branded identifier/secret types (docs/API_CONTRACT.md §2). These are all
 * unpadded-base64url strings at the wire level, but are kept structurally
 * distinct from each other and from a plain `string` so the type checker
 * catches, e.g., a management secret being passed where a trove ID is
 * expected — the branding is erased at runtime; it exists purely to make
 * these boundaries explicit at compile time.
 */
export type TroveId = string & { readonly __brand: 'TroveId' }
export type ManagementId = string & { readonly __brand: 'ManagementId' }

/**
 * A management secret is only ever a "value we generated ourselves" (this
 * branded form) in this codebase's own generator below. A secret presented
 * back to us later (e.g. from an `Authorization` header) is untrusted input
 * and is deliberately typed as a plain `string` everywhere else — see
 * `management.ts` — never widened to `ManagementSecret` without going
 * through validation first.
 */
export type ManagementSecret = string & { readonly __brand: 'ManagementSecret' }

// docs/API_CONTRACT.md §2.1/§2.2: 128 bits of entropy for both trove and
// management IDs.
const ID_ENTROPY_BYTES = 16

// docs/API_CONTRACT.md §2.2: 256 bits of entropy for the management secret.
const MANAGEMENT_SECRET_ENTROPY_BYTES = 32

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/**
 * Trove ID generation (docs/API_CONTRACT.md §2.1): 128-bit CSPRNG,
 * unpadded base64url. Called server-side for Standard Troves (the
 * server assigns the ID) and client-side for Private Troves (the client
 * must know the final ID before encryption, since it's bound into the
 * envelope's AAD — docs/PRIVATE_ENVELOPE.md §4a) — the generation logic
 * itself is identical either way, only *who* calls it and *when*
 * differs by mode.
 */
export function generateTroveId(): TroveId {
  return randomBase64Url(ID_ENTROPY_BYTES) as TroveId
}

/** Always server-generated, for both modes (docs/API_CONTRACT.md §2.2). */
export function generateManagementId(): ManagementId {
  return randomBase64Url(ID_ENTROPY_BYTES) as ManagementId
}

/**
 * Client-side generation in the real protocol (docs/API_CONTRACT.md §2.2);
 * exposed here so tests (and, later, a real client) can produce a
 * spec-shaped management secret without reimplementing the CSPRNG/encoding
 * choice. The server itself never calls this — it only ever verifies a
 * secret presented to it (see `management.ts`).
 */
export function generateManagementSecret(): ManagementSecret {
  return randomBase64Url(MANAGEMENT_SECRET_ENTROPY_BYTES) as ManagementSecret
}

// docs/DATABASE_SCHEMA.md §3.1's `troves_trove_id_format` CHECK: 128 bits,
// unpadded base64url, ceil(128/6) = 22 characters.
const TROVE_ID_FORMAT = /^[A-Za-z0-9_-]{22}$/

/**
 * A format sanity check only, not a cryptographic validation — used to
 * reject a client-proposed Private Trove ID (docs/API_CONTRACT.md §3.2)
 * before it ever reaches the database, mirroring the same regex the
 * `troves_trove_id_format` constraint enforces server-side as a
 * defense-in-depth backstop. A Standard Trove ID is always
 * server-generated via `generateTroveId()` above, so this check is never
 * needed on that path.
 */
export function isValidTroveIdFormat(value: string): boolean {
  return TROVE_ID_FORMAT.test(value)
}
