import type { PrivateEnvelope } from '../crypto/private-trove'
import type { ExpirationCode } from './types'

/**
 * Wire types for the Private Trove HTTP API this frontend slice talks to
 * (docs/API_CONTRACT.md §3.2, §4.3, §5.2, §5.6). `envelope` reuses the
 * `PrivateEnvelope` type `src/crypto/private-trove.ts` already
 * defines — that module is a client-safe (no crypto-library import) type
 * definition, not server-only code, so importing it here does not couple
 * this file to anything server-side; it avoids a second, drift-prone
 * redefinition of the exact same JSON shape docs/PRIVATE_ENVELOPE.md §11/
 * §12 specifies.
 */
export type { PrivateEnvelope } from '../crypto/private-trove'

/** docs/API_CONTRACT.md §3.2. */
export interface CreatePrivateTroveRequestBody {
  mode: 'private'
  troveId: string
  envelope: PrivateEnvelope
  expiration?: ExpirationCode
}

/** docs/API_CONTRACT.md §3.3. */
export interface CreatePrivateTroveResponseBody {
  troveId: string
  managementId: string
  mode: 'private'
  expiresAt: string | null
}

/** docs/API_CONTRACT.md §4.3. */
export interface PublicPrivateTroveViewBody {
  mode: 'private'
  envelope: PrivateEnvelope
  expiresAt: string | null
}

/** docs/API_CONTRACT.md §5.6. */
export interface ManagementPrivateTroveViewBody {
  troveId: string
  mode: 'private'
  envelope: PrivateEnvelope
  expiresAt: string | null
}

/** docs/API_CONTRACT.md §5.2: always a complete replacement envelope. */
export interface UpdatePrivateTroveRequestBody {
  envelope: PrivateEnvelope
  expiration?: ExpirationCode
}
