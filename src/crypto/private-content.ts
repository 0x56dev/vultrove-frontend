import type { PrivateContentPlaintext } from './private-trove'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'

/**
 * docs/DATABASE_SCHEMA.md "Private envelope size limits": the ceiling on
 * the canonical content-plaintext *before* encryption. Enforced
 * client-side only — the server never receives Private plaintext and
 * structurally cannot check this bound itself.
 */
export const MAX_CONTENT_PLAINTEXT_BYTES = 1_048_576

const MIN_LINKS = 1
const MAX_LINKS = 25

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

/**
 * Structural validation only — link count and field *types*, per
 * docs/PRIVATE_ENVELOPE.md §2 ("links has 1–25 entries... enforced by
 * the application before serialization"). Per-field character-count
 * maxima (title ≤120, etc., docs/V0.1_SPEC.md §11) are deliberately
 * **not** re-implemented here: those are a UI-form-layer responsibility,
 * exactly as they already are for Standard Troves
 * (`src/routes/create-trove/validation.ts`), not a crypto-library
 * concern. The one thing this module alone can and does guarantee is
 * that whatever it serializes/parses has the right shape and fits the
 * aggregate plaintext byte ceiling.
 */
function assertValidContentShape(
  value: unknown,
): asserts value is PrivateContentPlaintext {
  if (typeof value !== 'object' || value === null) {
    throw new PrivateEnvelopeValidationError('Content must be an object.')
  }
  const content = value as Record<string, unknown>

  if (content.schemaVersion !== 1) {
    throw new PrivateEnvelopeValidationError(
      `Unrecognized content schemaVersion: ${JSON.stringify(content.schemaVersion)}.`,
    )
  }
  if (typeof content.title !== 'string') {
    throw new PrivateEnvelopeValidationError('title must be a string.')
  }
  if (content.description !== null && typeof content.description !== 'string') {
    throw new PrivateEnvelopeValidationError(
      'description must be a string or null.',
    )
  }
  if (!Array.isArray(content.links)) {
    throw new PrivateEnvelopeValidationError('links must be an array.')
  }
  if (content.links.length < MIN_LINKS || content.links.length > MAX_LINKS) {
    throw new PrivateEnvelopeValidationError(
      `links must have between ${MIN_LINKS} and ${MAX_LINKS} entries (got ${content.links.length}).`,
    )
  }
  content.links.forEach((link: unknown, index: number) => {
    if (typeof link !== 'object' || link === null) {
      throw new PrivateEnvelopeValidationError(
        `links[${index}] must be an object.`,
      )
    }
    const l = link as Record<string, unknown>
    if (typeof l.url !== 'string') {
      throw new PrivateEnvelopeValidationError(
        `links[${index}].url must be a string.`,
      )
    }
    if (l.label !== null && typeof l.label !== 'string') {
      throw new PrivateEnvelopeValidationError(
        `links[${index}].label must be a string or null.`,
      )
    }
  })
}

/**
 * docs/PRIVATE_ENVELOPE.md §2: serializes trove content to the canonical
 * JSON document that's encrypted as "content" — fixed key order
 * (`schemaVersion`, `title`, `description`, `links[].url`/`label`), no
 * insignificant whitespace. A freshly-constructed object literal with
 * keys inserted in this exact order, passed to `JSON.stringify` with no
 * indent argument, already produces exactly that (per-spec, own
 * enumerable string keys are serialized in insertion order) — no
 * hand-rolled JSON writer is needed. Field order/whitespace is not
 * itself security-relevant (this JSON is encrypted, never signed on its
 * own) but is required for reproducible test vectors (§21).
 */
export function serializeContent(content: PrivateContentPlaintext): Uint8Array {
  assertValidContentShape(content)
  const canonical = {
    schemaVersion: content.schemaVersion,
    title: content.title,
    description: content.description,
    links: content.links.map((link) => ({ url: link.url, label: link.label })),
  }
  const bytes = textEncoder.encode(JSON.stringify(canonical))
  if (bytes.length > MAX_CONTENT_PLAINTEXT_BYTES) {
    throw new PrivateEnvelopeValidationError(
      `Content plaintext exceeds the ${MAX_CONTENT_PLAINTEXT_BYTES}-byte ceiling (got ${bytes.length} bytes).`,
    )
  }
  return bytes
}

/**
 * The inverse of `serializeContent`, used after a successful AEAD
 * decryption to recover structured content from decrypted plaintext
 * bytes. By the time this runs, AES-GCM has already authenticated the
 * bytes as genuine — a shape/JSON/UTF-8 failure here would indicate a
 * bug in this library's own serialization, not an attacker, but is
 * still validated defensively rather than trusted blindly.
 */
export function parseContentPlaintext(
  bytes: Uint8Array,
): PrivateContentPlaintext {
  let json: string
  try {
    json = textDecoder.decode(bytes)
  } catch {
    throw new PrivateEnvelopeValidationError(
      'Decrypted content is not valid UTF-8.',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new PrivateEnvelopeValidationError(
      'Decrypted content is not valid JSON.',
    )
  }
  assertValidContentShape(parsed)
  return parsed
}
