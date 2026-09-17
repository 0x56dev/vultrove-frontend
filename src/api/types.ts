/**
 * Wire types for the Standard Trove HTTP API this frontend slice talks to
 * (docs/API_CONTRACT.md §3.1/§3.3, §4.1/§4.2/§4.4, §5.1/§5.4/§5.6). These
 * are request/response *shapes on the wire* — JSON as it actually travels —
 * not UI form state (see `src/routes/create-trove/types.ts` for that) and
 * not the server's own internal domain types
 * (`src/crypto/trove.ts`), which this module deliberately does not
 * import: the frontend has no build-time coupling to server-only code.
 */

export type ExpirationCode = '1h' | '1d' | '7d' | '30d' | '1y' | 'never'

export interface WireLink {
  url: string
  label: string | null
}

/** docs/API_CONTRACT.md §3.1/§5.1: the same shape on both creation and
 * partial update. `value` is required, 1..256 Unicode code points, only
 * when `enabled` is `true`. */
export type WirePassword = { enabled: false } | { enabled: true; value: string }

/** docs/API_CONTRACT.md §3.1. */
export interface CreateStandardTroveRequestBody {
  mode: 'standard'
  title: string
  description: string | null
  links: WireLink[]
  expiration?: ExpirationCode
  password: WirePassword
}

/** docs/API_CONTRACT.md §3.3. */
export interface CreateStandardTroveResponseBody {
  troveId: string
  managementId: string
  mode: 'standard'
  expiresAt: string | null
}

/** docs/API_CONTRACT.md §4.2: a password-gated trove's `GET` (and a
 * failed `/unlock`) never carries content — omitted entirely, not `null`. */
export interface PublicStandardTroveViewLockedBody {
  mode: 'standard'
  passwordProtected: true
  expiresAt: string | null
}

/** docs/API_CONTRACT.md §4.1 (unprotected) and §4.2 (a successful
 * `/unlock`, where `passwordProtected` is `true`). */
export interface PublicStandardTroveViewContentBody {
  mode: 'standard'
  title: string
  description: string | null
  links: WireLink[]
  expiresAt: string | null
  passwordProtected: boolean
}

export type PublicStandardTroveViewBody =
  PublicStandardTroveViewLockedBody | PublicStandardTroveViewContentBody

/** Narrows the `GET /api/v1/troves/:id` union — distinguishing the two
 * variants by the presence of `title`, since both can have
 * `passwordProtected: true` (a locked view and a successfully unlocked
 * one are not distinguishable by that field alone). */
export function isLockedTroveView(
  body: PublicStandardTroveViewBody,
): body is PublicStandardTroveViewLockedBody {
  return !('title' in body)
}

/** docs/API_CONTRACT.md §5.4/§5.6: the full-content view shape plus
 * `troveId`, returned by both `GET /api/v1/management/:managementId` and
 * a successful `PATCH`. Always full content, regardless of
 * `passwordProtected` — the management capability bypasses the viewing
 * password entirely. */
export interface ManagementStandardTroveViewBody {
  troveId: string
  mode: 'standard'
  title: string
  description: string | null
  links: WireLink[]
  expiresAt: string | null
  passwordProtected: boolean
}

/** docs/API_CONTRACT.md §5.1: partial update, every field optional.
 * `password` follows the "omitted means unchanged" rule like every other
 * field — see `src/routes/create-trove/to-wire.ts`'s `toWirePassword`. */
export interface UpdateStandardTroveRequestBody {
  title?: string
  description?: string | null
  links?: WireLink[]
  expiration?: ExpirationCode
  password?: WirePassword
}
