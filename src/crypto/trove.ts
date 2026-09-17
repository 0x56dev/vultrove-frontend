import type { TroveId, ManagementId } from './ids'
import type { ManagementVerifier } from './management'
import type { ExpirationCode } from './expiration'

/**
 * Standard Trove domain objects (docs/V0.1_SPEC.md §1/§3, §11;
 * docs/API_CONTRACT.md §3.1/§4.1/§5.1). Private Trove types are
 * deliberately not modeled here — this slice covers Standard Troves only.
 */

export interface Link {
  url: string
  label: string | null
}

/**
 * Standard password protection (docs/V0.1_SPEC.md §7, docs/THREAT_MODEL.md
 * §7, docs/API_CONTRACT.md §3.1). `StandardPasswordEnabled.value` is the
 * plaintext password as submitted — it is hashed immediately by the
 * application layer (`../application/standard-trove-service.ts` via
 * `./password.ts`) and never itself persisted, logged, or returned.
 */
export interface StandardPasswordDisabled {
  enabled: false
}

export interface StandardPasswordEnabled {
  enabled: true
  value: string
}

export type StandardPassword =
  StandardPasswordDisabled | StandardPasswordEnabled

/** The persisted, storage-shaped Standard Trove record. */
export interface StandardTroveRecord {
  troveId: TroveId
  managementId: ManagementId
  managementVerifier: ManagementVerifier
  mode: 'standard'
  title: string
  description: string | null
  links: Link[]
  /**
   * The Argon2id PHC-format string (docs/DATABASE_SCHEMA.md §3.2,
   * docs/THREAT_MODEL.md §7), or `null` when the trove has no access-gate
   * password — mirroring the database column exactly: there is no
   * separate "enabled" boolean, "enabled" is `passwordVerifier !== null`.
   */
  passwordVerifier: string | null
  expirationCode: ExpirationCode
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** docs/API_CONTRACT.md §3.1. */
export interface CreateStandardTroveInput {
  title: string
  description: string | null
  links: Link[]
  /** Omitted means the default (`7d`, docs/V0.1_SPEC.md §10). */
  expiration?: ExpirationCode
  password: StandardPassword
}

/**
 * docs/API_CONTRACT.md §5.1: partial update, an omitted field is left
 * unchanged. `mode` is included only so a caller can *attempt* to change it
 * at runtime (e.g. from untrusted deserialized JSON that bypasses the type
 * system) and have that attempt explicitly rejected — see
 * docs/API_CONTRACT.md §5.3 and the "mode cannot be changed" test.
 * `password` follows the same "omitted means unchanged" rule as every
 * other field: omit to leave password protection as-is, `{enabled:false}`
 * to remove it, `{enabled:true, value}` to set or replace it.
 */
export interface UpdateStandardTroveInput {
  title?: string
  description?: string | null
  links?: Link[]
  expiration?: ExpirationCode
  password?: StandardPassword
  mode?: string
}

/** docs/API_CONTRACT.md §3.3. */
export interface CreateStandardTroveResult {
  troveId: TroveId
  managementId: ManagementId
  mode: 'standard'
  expiresAt: Date | null
}

export interface StandardTroveContent {
  title: string
  description: string | null
  links: Link[]
}

/**
 * docs/API_CONTRACT.md §4.2: a password-gated trove's `GET` response
 * omits content entirely (not `null` — absent), so a client can't mistake
 * "no description" for "not yet unlocked."
 */
export interface PublicStandardTroveViewLocked {
  kind: 'locked'
  mode: 'standard'
  passwordProtected: true
  expiresAt: Date | null
}

/**
 * The full-content public view — docs/API_CONTRACT.md §4.1 (unprotected)
 * and, after a successful `POST .../unlock` (§4.2), the same shape for a
 * protected trove (`passwordProtected: true` in that case). `kind` is an
 * internal discriminant only; the HTTP layer never serializes it.
 */
export interface PublicStandardTroveViewContent extends StandardTroveContent {
  kind: 'content'
  mode: 'standard'
  passwordProtected: boolean
  expiresAt: Date | null
}

export type PublicStandardTroveView =
  PublicStandardTroveViewLocked | PublicStandardTroveViewContent

/**
 * docs/API_CONTRACT.md §5.4/§5.6: the management view always carries full
 * content — the management capability bypasses the viewing password
 * entirely (it is a wholly separate authorization mechanism, task
 * requirement) — plus `troveId` and an accurate `passwordProtected` flag.
 * Never includes the password or its hash.
 */
export interface ManagementStandardTroveView extends StandardTroveContent {
  troveId: TroveId
  mode: 'standard'
  expiresAt: Date | null
  passwordProtected: boolean
}
