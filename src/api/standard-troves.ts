import { apiRequest } from './client'
import type {
  CreateStandardTroveRequestBody,
  CreateStandardTroveResponseBody,
  ExpirationCode,
  ManagementStandardTroveViewBody,
  PublicStandardTroveViewBody,
  PublicStandardTroveViewContentBody,
  UpdateStandardTroveRequestBody,
  WireLink,
  WirePassword,
} from './types'

/**
 * Typed calls for the Standard Trove lifecycle this frontend slice
 * implements (docs/API_CONTRACT.md §3/§4/§5). Every path is relative —
 * see `client.ts` for why. This module owns no state and does not touch
 * `window.location`/storage/crypto itself; callers (routes/components)
 * are responsible for generating the management secret and constructing
 * URLs (`src/api/urls.ts`).
 */

export interface CreateStandardTroveInput {
  title: string
  description: string | null
  links: WireLink[]
  expiration?: ExpirationCode
  password: WirePassword
}

/**
 * docs/API_CONTRACT.md §3.1/§3.3. `managementSecret` is the freshly
 * client-generated secret (§2.2) sent once via `Authorization: Bearer`
 * (§2.3) — this function never stores it; the caller does that (or
 * rather, deliberately does not — see `docs/API_CONTRACT.md` and this
 * slice's secret-handling requirements). `input.password.value`, if
 * present, travels once in this request body over TLS and nowhere else —
 * this function does not retain, log, or echo it.
 */
export function createStandardTrove(
  input: CreateStandardTroveInput,
  managementSecret: string,
): Promise<CreateStandardTroveResponseBody> {
  const body: CreateStandardTroveRequestBody = {
    mode: 'standard',
    title: input.title,
    description: input.description,
    links: input.links,
    expiration: input.expiration,
    password: input.password,
  }
  return apiRequest({
    method: 'POST',
    path: '/api/v1/troves',
    authorization: managementSecret,
    body,
  })
}

/** docs/API_CONTRACT.md §4.1/§4.2/§4.4. Unauthenticated — no secret
 * involved. Returns the locked shape (no content) for a password-gated
 * trove that hasn't been unlocked yet — see `unlockStandardTrove`. */
export function getPublicTrove(
  troveId: string,
): Promise<PublicStandardTroveViewBody> {
  return apiRequest({
    method: 'GET',
    path: `/api/v1/troves/${encodeURIComponent(troveId)}`,
  })
}

/**
 * docs/API_CONTRACT.md §4.2. Submits a Standard Trove's access-gate
 * password out-of-band from `GET`, as a request body field — never a
 * query parameter or URL fragment — so it never appears in the address
 * bar, browser history, or a server access log. Unauthenticated (no
 * management secret involved; wholly independent of that authorization
 * model): a wrong password, or a password submitted against a trove
 * that isn't protected at all, both surface as the same generic
 * `ApiError('unauthorized', ...)`.
 */
export function unlockStandardTrove(
  troveId: string,
  password: string,
): Promise<PublicStandardTroveViewContentBody> {
  return apiRequest({
    method: 'POST',
    path: `/api/v1/troves/${encodeURIComponent(troveId)}/unlock`,
    body: { password },
  })
}

/**
 * docs/API_CONTRACT.md §5.6 (added in this slice). Requires the
 * management secret read from the URL fragment by the caller — this
 * function never reads `window.location` itself.
 */
export function getManagementView(
  managementId: string,
  managementSecret: string,
): Promise<ManagementStandardTroveViewBody> {
  return apiRequest({
    method: 'GET',
    path: `/api/v1/management/${encodeURIComponent(managementId)}`,
    authorization: managementSecret,
  })
}

/** docs/API_CONTRACT.md §5.1/§5.4: partial update, omitted fields unchanged. */
export function updateStandardTrove(
  managementId: string,
  managementSecret: string,
  patch: UpdateStandardTroveRequestBody,
): Promise<ManagementStandardTroveViewBody> {
  return apiRequest({
    method: 'PATCH',
    path: `/api/v1/management/${encodeURIComponent(managementId)}`,
    authorization: managementSecret,
    body: patch,
  })
}

/** docs/API_CONTRACT.md §5.4/§5.5: 204 on success, resolves to `undefined`. */
export function deleteTrove(
  managementId: string,
  managementSecret: string,
): Promise<void> {
  return apiRequest({
    method: 'DELETE',
    path: `/api/v1/management/${encodeURIComponent(managementId)}`,
    authorization: managementSecret,
  })
}
