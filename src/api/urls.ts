/**
 * Constructs the two capability URLs a creator receives once
 * (docs/V0.1_SPEC.md §2/§5, docs/API_CONTRACT.md §3.3). The server never
 * returns either URL (§3.3: "would be redundant and would create a second
 * place those URL formats could drift out of sync") — the client builds
 * both from identifiers/secrets it already has, using the page's own
 * current origin rather than a hardcoded host, so these work unchanged in
 * local dev, production, and any future onion/i2p front door
 * (docs/RUNTIME_ARCHITECTURE.md §5).
 *
 * `origin` defaults to `window.location.origin`, evaluated fresh on each
 * call (a JS default-parameter expression is not evaluated until the
 * function actually runs without that argument) — never captured once at
 * module load. Tests pass an explicit origin instead of relying on the
 * default, so they can assert no host is hardcoded here.
 */

export function buildPublicTroveUrl(
  troveId: string,
  origin: string = window.location.origin,
): string {
  return `${origin}/c/${encodeURIComponent(troveId)}`
}

/**
 * A Private Trove's share URL (docs/PRIVATE_ENVELOPE.md §15): the public
 * trove URL plus the decryption fragment (`v1.<43-char base64url>`,
 * already-fragment-safe — see `buildManagementUrl`'s identical reasoning
 * for why it's never passed through `encodeURIComponent`). This is the
 * *decryption* capability — distinct in purpose from `buildManagementUrl`,
 * which grants replace/delete authority but no decryption.
 */
export function buildPrivateShareUrl(
  troveId: string,
  fragment: string,
  origin: string = window.location.origin,
): string {
  return `${buildPublicTroveUrl(troveId, origin)}#${fragment}`
}

/**
 * The management secret is placed in the URL **fragment**, never a query
 * parameter or path segment (docs/API_CONTRACT.md §2.2/§2.4) — a fragment
 * is never sent to the server by the browser on ordinary navigation. The
 * secret is already unpadded base64url (`[A-Za-z0-9_-]` only,
 * `src/crypto/base64url.ts`), which is already fragment-safe, so
 * it is deliberately not passed through `encodeURIComponent` — doing so
 * would be a no-op for this exact character set but could mislead a
 * future reader into thinking it's meaningfully "escaping" the secret.
 */
export function buildManagementUrl(
  managementId: string,
  managementSecret: string,
  origin: string = window.location.origin,
): string {
  return `${origin}/m/${encodeURIComponent(managementId)}#${managementSecret}`
}
