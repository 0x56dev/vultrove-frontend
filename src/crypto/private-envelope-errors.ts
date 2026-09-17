/**
 * docs/PRIVATE_ENVELOPE.md §18/§20: structural/input validation failures
 * (malformed envelope shape, unrecognized version/alg/mode/kdf identity/
 * kdfVersion, a kdf.params mismatch, wrong-length binary fields, a
 * malformed fragment, an oversized plaintext or envelope) are detectable
 * *before* any cryptographic operation runs and may be reported
 * distinctly from a decryption failure. This is the one error class
 * every `private-*` module in this directory throws for that entire
 * category of problem.
 *
 * A decryption/authentication failure (wrong password, wrong/missing
 * fragment secret, tampered ciphertext, tampered AAD-bound field) is
 * deliberately *not* an exception anywhere in this library — see
 * `openPrivateEnvelope` in `./private-envelope.ts`, which returns `null`
 * for that entire class instead, exactly because §18 requires that these
 * causes never be distinguished from one another. Catching
 * `PrivateEnvelopeValidationError` specifically is therefore enough for
 * a caller to separate "this input was malformed" from "the crypto
 * verification did not succeed," without over-interpreting the latter.
 */
export class PrivateEnvelopeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivateEnvelopeValidationError'
  }
}

/**
 * Thrown by `createPrivateEnvelope`/`openPrivateEnvelope`
 * (`./private-envelope.ts`) before any AES-GCM/Argon2id operation is
 * attempted, when `crypto.subtle` isn't available in this browser at all
 * — distinct from `PrivateEnvelopeValidationError` (malformed *input*)
 * because this is an *environment* problem the caller can't fix by
 * retrying or correcting a field. The overwhelmingly common real-world
 * cause is `reason: 'insecure-context'`: every mainstream browser only
 * exposes `crypto.subtle` in a secure context (HTTPS, or `http://` on
 * `localhost`/`127.0.0.1`) — a page loaded over plain `http://` at a
 * LAN IP (the common way to reach a dev server from a phone/tablet on
 * the same network) is not one, so `crypto.subtle` is simply `undefined`
 * there. This is never surfaced as the generic "something went wrong" —
 * callers must catch it and show a distinct, actionable message.
 */
export class PrivateCryptoUnavailableError extends Error {
  readonly reason: 'insecure-context' | 'unavailable'

  constructor(reason: 'insecure-context' | 'unavailable') {
    super(
      reason === 'insecure-context'
        ? 'crypto.subtle is unavailable because this page was not loaded ' +
            'in a secure context (HTTPS, or http://localhost).'
        : 'crypto.subtle is unavailable in this browser.',
    )
    this.name = 'PrivateCryptoUnavailableError'
    this.reason = reason
  }
}
