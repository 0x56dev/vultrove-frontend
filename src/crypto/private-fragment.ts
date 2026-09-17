import { base64UrlEncode, base64UrlDecode } from './base64url'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'

/**
 * docs/PRIVATE_ENVELOPE.md §15: both Private modes share one fragment
 * shape — `v1.` followed by a 32-byte CSPRNG value, base64url-encoded
 * without padding (43 characters). The 32-byte value's *meaning* is
 * mode-dependent, resolved from the fetched envelope's `mode` field —
 * never from the fragment string itself: the content encryption key
 * directly (`mode: "plain"`) or the KDF salt / fragment secret
 * (`mode: "password"`).
 */

const FRAGMENT_VERSION_PREFIX = 'v1.'
const FRAGMENT_SECRET_BYTES = 32
const FRAGMENT_PATTERN = /^v1\.[A-Za-z0-9_-]{43}$/

/** Builds the fragment text (no leading `#`) for a 32-byte secret. */
export function encodeFragment(secret: Uint8Array): string {
  if (secret.length !== FRAGMENT_SECRET_BYTES) {
    throw new PrivateEnvelopeValidationError(
      `Fragment secret must be exactly ${FRAGMENT_SECRET_BYTES} bytes (got ${secret.length}).`,
    )
  }
  return FRAGMENT_VERSION_PREFIX + base64UrlEncode(secret)
}

/**
 * Parses and validates a URL fragment (the text after `#`, with no
 * leading `#`) for either Private mode. Rejects anything not matching
 * the fixed `v1.<43 chars>` pattern — including an empty string, i.e. a
 * missing fragment — *before* attempting to treat it as key material,
 * per docs/PRIVATE_ENVELOPE.md §15/§19. A missing/malformed fragment is
 * exactly the kind of failure §18 says callers may report distinctly
 * from a decryption failure, since it's detectable with no cryptographic
 * operation at all.
 */
export function parseFragment(fragment: string): Uint8Array {
  if (!FRAGMENT_PATTERN.test(fragment)) {
    throw new PrivateEnvelopeValidationError(
      'Fragment does not match the expected "v1.<43-character base64url>" format.',
    )
  }
  const encoded = fragment.slice(FRAGMENT_VERSION_PREFIX.length)
  const decoded = base64UrlDecode(encoded)
  if (decoded === null || decoded.length !== FRAGMENT_SECRET_BYTES) {
    // The regex already constrains alphabet/length tightly enough that
    // this should be unreachable — kept as a fail-closed backstop rather
    // than assumed impossible.
    throw new PrivateEnvelopeValidationError(
      `Fragment secret did not decode to ${FRAGMENT_SECRET_BYTES} bytes.`,
    )
  }
  return decoded
}
