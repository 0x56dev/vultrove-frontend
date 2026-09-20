/**
 * Unpadded base64url encode/decode, used throughout the domain layer for
 * trove/management identifiers and the management secret (docs/V0.1_SPEC.md
 * §1, docs/API_CONTRACT.md §2, docs/THREAT_MODEL.md §9). Implemented on top
 * of the standard `atob`/`btoa` globals (available in browsers, Node, and
 * Cloudflare Workers alike) rather than a Node-specific `Buffer`, to avoid
 * tying the domain layer to any one runtime ahead of the still-open hosting
 * decision.
 */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Returns `null` for any input that is not well-formed unpadded base64url —
 * never throws. Callers that require an exact decoded length (e.g. "must be
 * 32 bytes") check `bytes.length` themselves; this function only concerns
 * itself with whether the text is valid base64url at all.
 */
export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    return null
  }
  const remainder = text.length % 4
  if (remainder === 1) {
    // No valid base64 encoding produces a length congruent to 1 mod 4.
    return null
  }
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - remainder) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  // `atob` accepts non-zero unused padding bits, which gives some byte
  // strings multiple textual aliases. Credentials and identifiers must have
  // exactly one representation, so accept only the encoder's canonical
  // unpadded base64url spelling.
  return base64UrlEncode(bytes) === text ? bytes : null
}
