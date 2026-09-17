import { apiRequest } from './client'
import type {
  ExpirationCode,
  ManagementStandardTroveViewBody,
  PublicStandardTroveViewBody,
} from './types'
import type {
  CreatePrivateTroveRequestBody,
  CreatePrivateTroveResponseBody,
  ManagementPrivateTroveViewBody,
  PrivateEnvelope,
  PublicPrivateTroveViewBody,
  UpdatePrivateTroveRequestBody,
} from './private-types'

/**
 * Typed calls for the Private Trove lifecycle (docs/API_CONTRACT.md
 * §3.2/§4.3/§5.2/§5.6). Like `standard-troves.ts`, this module owns no
 * crypto/state itself — every `envelope` value here is already-encrypted
 * ciphertext the caller produced with `src/crypto/private-envelope.ts`
 * before calling in, and every decrypted value the caller does with a
 * response stays entirely in the caller's own local state. This module
 * never touches `window.location`, storage, or `crypto.subtle`/Argon2id.
 */

/**
 * docs/API_CONTRACT.md §3.2/§3.3. `managementSecret` is client-generated
 * exactly as for Standard creation (§2.2/§2.3) and sent the same way — via
 * `Authorization: Bearer`, never a body field. `troveId`/`envelope` must
 * already be fully constructed (client-side trove-ID generation +
 * `createPrivateEnvelope`) before calling this; on `id_conflict` (409,
 * §2.1) the caller is expected to generate a fresh trove ID, rebuild the
 * envelope's AAD under it, and retry — this function does not retry
 * itself, since only the caller holds the plaintext needed to rebuild the
 * envelope.
 */
export function createPrivateTrove(
  troveId: string,
  envelope: PrivateEnvelope,
  expiration: ExpirationCode | undefined,
  managementSecret: string,
): Promise<CreatePrivateTroveResponseBody> {
  const body: CreatePrivateTroveRequestBody = {
    mode: 'private',
    troveId,
    envelope,
    expiration,
  }
  return apiRequest({
    method: 'POST',
    path: '/api/v1/troves',
    authorization: managementSecret,
    body,
  })
}

/**
 * docs/API_CONTRACT.md §4.1/§4.2/§4.3/§4.4: `GET /api/v1/troves/:id` is a
 * single mode-agnostic endpoint — a public trove ID carries no mode
 * signal of its own, so the response's own `mode` field is what
 * distinguishes a Standard view from a Private one. Callers narrow on
 * `mode` (and, for Standard, `isLockedTroveView`) after this resolves.
 */
export function getTrove(
  troveId: string,
): Promise<PublicStandardTroveViewBody | PublicPrivateTroveViewBody> {
  return apiRequest({
    method: 'GET',
    path: `/api/v1/troves/${encodeURIComponent(troveId)}`,
  })
}

/**
 * docs/API_CONTRACT.md §5.6: same mode-agnostic dispatch as `getTrove`,
 * for the authenticated management view.
 */
export function getManagementViewAny(
  managementId: string,
  managementSecret: string,
): Promise<ManagementStandardTroveViewBody | ManagementPrivateTroveViewBody> {
  return apiRequest({
    method: 'GET',
    path: `/api/v1/management/${encodeURIComponent(managementId)}`,
    authorization: managementSecret,
  })
}

/**
 * docs/API_CONTRACT.md §5.2: `envelope` is always a complete replacement,
 * never a partial/merged update — the caller must have already run a
 * fresh `createPrivateEnvelope` (docs/PRIVATE_ENVELOPE.md §17's full
 * rotation: fresh content key, fresh nonces, and — for password mode —
 * fresh fragment secret, on every edit including an expiration-only one).
 */
export function updatePrivateTrove(
  managementId: string,
  managementSecret: string,
  patch: UpdatePrivateTroveRequestBody,
): Promise<ManagementPrivateTroveViewBody> {
  return apiRequest({
    method: 'PATCH',
    path: `/api/v1/management/${encodeURIComponent(managementId)}`,
    authorization: managementSecret,
    body: patch,
  })
}
