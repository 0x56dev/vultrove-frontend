import type { TroveId } from './ids'
import { base64UrlEncode } from './base64url'
import { buildContentAad, buildWrapAad } from './private-encoding'
import {
  deriveKekV1,
  isValidKdfParamsV1,
  KDF_V1_PARAMS_BYTES,
} from './private-kdf'
import { serializeContent, parseContentPlaintext } from './private-content'
import type {
  PrivateContentPlaintext,
  PrivateEnvelope,
  PrivateEnvelopePassword,
  PrivateEnvelopePlain,
} from './private-trove'
import {
  PrivateEnvelopeValidationError,
  PrivateCryptoUnavailableError,
} from './private-envelope-errors'
import {
  ENVELOPE_VERSION,
  RECOGNIZED_ALG as ALG,
  NONCE_BYTES,
  mustDecodeBase64Url,
  mustDecodeFixedLength,
  assertEnvelopeSizeWithinLimit,
} from './private-envelope-validation'

/**
 * Create/open orchestration for the Private Trove envelope
 * (docs/PRIVATE_ENVELOPE.md, full document). This module — and every
 * other client-only `private-*` module in this directory — runs
 * **client-side only**. Nothing here is ever called by
 * `src/server/http`, `src/server/application`, or `src/server/storage`.
 * The server's role (Stage 2) is limited to storing and structurally
 * validating the opaque `envelope` this module produces, via
 * `./private-envelope-validation.ts` — never decrypting it, never
 * deriving a key, never seeing a password. Structural validation
 * (`parsePrivateEnvelope` and friends) now lives in
 * `./private-envelope-validation.ts`, which this file re-uses rather
 * than duplicates, specifically so that module can be safely imported by
 * the server without pulling this file's `hash-wasm`/AES-GCM-orchestration
 * code along with it.
 */

const CONTENT_KEY_BYTES = 32
const FRAGMENT_SECRET_BYTES = 32
const GCM_TAG_BITS = 128

/**
 * docs/PRIVATE_ENVELOPE.md §14 (extended for this diagnosis): checked
 * first, before any AES-GCM/Argon2id call, in both `createPrivateEnvelope`
 * and `openPrivateEnvelope` — so a missing `crypto.subtle` (almost always
 * an insecure-context page load, e.g. a phone reaching a dev server over
 * plain `http://<lan-ip>:5173`) is reported as a distinct, diagnosable
 * `PrivateCryptoUnavailableError` instead of an unhandled
 * `TypeError: Cannot read properties of undefined (reading 'importKey')`
 * that every caller up the stack would otherwise have to collapse into
 * the same generic "something went wrong" message as any other failure.
 * `crypto.getRandomValues` itself has no such restriction (it works in
 * an insecure context) — only `crypto.subtle` does — which is exactly
 * why this can't be caught any earlier than the first `crypto.subtle`
 * call site.
 */
function assertPrivateCryptoAvailable(): void {
  if (typeof crypto !== 'undefined' && crypto.subtle !== undefined) {
    return
  }
  throw new PrivateCryptoUnavailableError(
    typeof window !== 'undefined' && window.isSecureContext === false
      ? 'insecure-context'
      : 'unavailable',
  )
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/** docs/PRIVATE_ENVELOPE.md §7: a fresh random 256-bit content key,
 * generated for every new trove and every edit — never derived from a
 * password or reused. */
export function generateContentKey(): Uint8Array {
  return randomBytes(CONTENT_KEY_BYTES)
}

/** docs/PRIVATE_ENVELOPE.md §12: a fresh random 256-bit fragment secret
 * (password mode only), used as the Argon2id salt — same length as a
 * content key but a distinct value with a distinct role; never reused
 * across troves or across an edit of the same trove. */
export function generateFragmentSecret(): Uint8Array {
  return randomBytes(FRAGMENT_SECRET_BYTES)
}

async function importAesGcmKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function aesGcmEncrypt(
  rawKey: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const key = await importAesGcmKey(rawKey)
  const result = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as BufferSource,
      additionalData: aad as BufferSource,
      tagLength: GCM_TAG_BITS,
    },
    key,
    plaintext as BufferSource,
  )
  return new Uint8Array(result)
}

/**
 * docs/PRIVATE_ENVELOPE.md §18: returns `null` on authentication
 * failure — **never throws** for that case, and the caller must never
 * attempt to further distinguish *why* verification failed (wrong key,
 * wrong nonce, tampered ciphertext, tampered AAD-bound field — a single
 * AEAD-verification outcome cannot and must not be over-interpreted).
 * Uses the platform's constant-time AEAD verification (`crypto.subtle`)
 * rather than any manual comparison.
 */
async function aesGcmDecrypt(
  rawKey: Uint8Array,
  nonce: Uint8Array,
  ciphertextWithTag: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array | null> {
  const key = await importAesGcmKey(rawKey)
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce as BufferSource,
        additionalData: aad as BufferSource,
        tagLength: GCM_TAG_BITS,
      },
      key,
      ciphertextWithTag as BufferSource,
    )
    return new Uint8Array(result)
  } catch {
    return null
  }
}

export interface CreatePrivateEnvelopeResult {
  envelope: PrivateEnvelope
  /**
   * The exact 32 bytes to carry in the share URL fragment
   * (docs/PRIVATE_ENVELOPE.md §15) — the content key itself for `plain`
   * mode, or the fragment secret/KDF salt for `password` mode. The
   * caller is responsible for encoding this via
   * `encodeFragment` (`./private-fragment.ts`) and for never logging,
   * persisting, or transmitting it anywhere.
   */
  fragmentSecret: Uint8Array
}

/**
 * docs/PRIVATE_ENVELOPE.md §11/§12/§17: encrypts `content` into a fresh
 * envelope bound to `troveId` via AAD. `troveId` must already be
 * generated (`generateTroveId()`, `./ids.ts`) — this function does not
 * generate it, since the caller needs the same ID for both the envelope
 * and the outer create/edit request.
 *
 * Every call generates entirely fresh key material (content key, and —
 * password mode — fragment secret) and fresh nonces; nothing is ever
 * reused from a prior envelope. This is what makes both trove creation
 * and the mandatory full-rotation edit (docs/V0.1_SPEC.md §6) the exact
 * same operation from this function's point of view.
 */
export async function createPrivateEnvelope(
  troveId: TroveId,
  content: PrivateContentPlaintext,
  password?: string,
): Promise<CreatePrivateEnvelopeResult> {
  assertPrivateCryptoAvailable()
  const plaintext = serializeContent(content)
  const nonce = randomBytes(NONCE_BYTES)

  if (password === undefined) {
    const contentKey = generateContentKey()
    const aad = buildContentAad({
      v: ENVELOPE_VERSION,
      troveId,
      alg: ALG,
      mode: 'plain',
    })
    const ciphertext = await aesGcmEncrypt(contentKey, nonce, plaintext, aad)
    const envelope: PrivateEnvelopePlain = {
      v: ENVELOPE_VERSION,
      alg: ALG,
      mode: 'plain',
      nonce: base64UrlEncode(nonce),
      ciphertext: base64UrlEncode(ciphertext),
    }
    assertEnvelopeSizeWithinLimit(envelope)
    return { envelope, fragmentSecret: contentKey }
  }

  const contentKey = generateContentKey()
  const fragmentSecret = generateFragmentSecret()

  const contentAad = buildContentAad({
    v: ENVELOPE_VERSION,
    troveId,
    alg: ALG,
    mode: 'password',
  })
  const ciphertext = await aesGcmEncrypt(
    contentKey,
    nonce,
    plaintext,
    contentAad,
  )

  const kek = await deriveKekV1(password, fragmentSecret)
  const wrapNonce = randomBytes(NONCE_BYTES)
  const wrapAad = buildWrapAad({
    v: ENVELOPE_VERSION,
    troveId,
    wrappedKeyAlg: ALG,
    kdfId: 'argon2id',
    kdfVersion: 1,
    kdfParams: KDF_V1_PARAMS_BYTES,
  })
  const wrappedCiphertext = await aesGcmEncrypt(
    kek,
    wrapNonce,
    contentKey,
    wrapAad,
  )

  const envelope: PrivateEnvelopePassword = {
    v: ENVELOPE_VERSION,
    alg: ALG,
    mode: 'password',
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
    kdf: {
      id: 'argon2id',
      kdfVersion: 1,
      params: base64UrlEncode(KDF_V1_PARAMS_BYTES),
    },
    wrappedKey: {
      alg: ALG,
      nonce: base64UrlEncode(wrapNonce),
      ciphertext: base64UrlEncode(wrappedCiphertext),
    },
  }
  assertEnvelopeSizeWithinLimit(envelope)
  return { envelope, fragmentSecret }
}

/**
 * docs/PRIVATE_ENVELOPE.md §18/§19/§20: decrypts and returns the
 * content, or `null` if AEAD verification failed for any reason (wrong
 * password, wrong/tampered fragment secret, tampered ciphertext, or a
 * tampered AAD-bound field) — deliberately a single, undistinguished
 * outcome. Throws `PrivateEnvelopeValidationError` only for problems
 * detectable *before* any cryptographic operation: a malformed
 * `fragmentSecret` length, a password-mode envelope opened without a
 * password, or a malformed base64url/length field.
 *
 * `envelope` must already be a validated `PrivateEnvelope` (e.g. via
 * `parsePrivateEnvelope` for envelope JSON from an untrusted source —
 * this function does not re-check `v`/`alg`/`mode`/`kdf.id`/
 * `kdf.kdfVersion` against the recognized-value registry, since a
 * `PrivateEnvelope`-typed value already guarantees those fields by
 * construction). This function *does* still independently re-verify
 * `kdf.params` against the expected kdfVersion-1 encoding
 * (`isValidKdfParamsV1`) — unlike the literal-typed fields above,
 * `kdf.params` is a plain `string`, so the type system cannot guarantee
 * its *value*; re-checking it here is inexpensive, genuine defense in
 * depth against a caller that constructed a `PrivateEnvelopePassword`
 * directly rather than through `parsePrivateEnvelope`.
 */
export async function openPrivateEnvelope(
  troveId: TroveId,
  envelope: PrivateEnvelope,
  fragmentSecret: Uint8Array,
  password?: string,
): Promise<PrivateContentPlaintext | null> {
  assertPrivateCryptoAvailable()
  if (fragmentSecret.length !== FRAGMENT_SECRET_BYTES) {
    throw new PrivateEnvelopeValidationError(
      `Fragment secret must be exactly ${FRAGMENT_SECRET_BYTES} bytes (got ${fragmentSecret.length}).`,
    )
  }

  const nonce = mustDecodeFixedLength(envelope.nonce, NONCE_BYTES, 'nonce')
  const ciphertext = mustDecodeBase64Url(envelope.ciphertext, 'ciphertext')

  let contentKey: Uint8Array
  if (envelope.mode === 'plain') {
    contentKey = fragmentSecret
  } else {
    if (password === undefined) {
      throw new PrivateEnvelopeValidationError(
        'A password is required to open a password-protected envelope.',
      )
    }
    if (!isValidKdfParamsV1(envelope.kdf.params)) {
      throw new PrivateEnvelopeValidationError(
        'kdf.params does not match the expected kdfVersion 1 encoding.',
      )
    }
    const kek = await deriveKekV1(password, fragmentSecret)
    const wrapNonce = mustDecodeFixedLength(
      envelope.wrappedKey.nonce,
      NONCE_BYTES,
      'wrappedKey.nonce',
    )
    const wrappedCiphertext = mustDecodeBase64Url(
      envelope.wrappedKey.ciphertext,
      'wrappedKey.ciphertext',
    )
    const wrapAad = buildWrapAad({
      v: envelope.v,
      troveId,
      wrappedKeyAlg: envelope.wrappedKey.alg,
      kdfId: envelope.kdf.id,
      kdfVersion: envelope.kdf.kdfVersion,
      kdfParams: mustDecodeBase64Url(envelope.kdf.params, 'kdf.params'),
    })
    const unwrapped = await aesGcmDecrypt(
      kek,
      wrapNonce,
      wrappedCiphertext,
      wrapAad,
    )
    if (unwrapped === null) {
      return null
    }
    contentKey = unwrapped
  }

  const contentAad = buildContentAad({
    v: envelope.v,
    troveId,
    alg: envelope.alg,
    mode: envelope.mode,
  })
  const plaintext = await aesGcmDecrypt(
    contentKey,
    nonce,
    ciphertext,
    contentAad,
  )
  if (plaintext === null) {
    return null
  }
  return parseContentPlaintext(plaintext)
}
