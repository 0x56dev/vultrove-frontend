import { describe, it, expect } from 'vitest'
import {
  serializeContent,
  parseContentPlaintext,
  MAX_CONTENT_PLAINTEXT_BYTES,
} from './private-content'
import { PrivateEnvelopeValidationError } from './private-envelope-errors'
import type { PrivateContentPlaintext } from './private-trove'

function validContent(
  overrides: Partial<PrivateContentPlaintext> = {},
): PrivateContentPlaintext {
  return {
    schemaVersion: 1,
    title: 'My mirrors',
    description: 'A short description',
    links: [{ url: 'https://example.com/a', label: 'Example A' }],
    ...overrides,
  }
}

describe('serializeContent', () => {
  it('produces canonical, whitespace-free JSON with the fixed key order', () => {
    const bytes = serializeContent(validContent())
    const json = new TextDecoder().decode(bytes)
    expect(json).toBe(
      '{"schemaVersion":1,"title":"My mirrors","description":"A short description","links":[{"url":"https://example.com/a","label":"Example A"}]}',
    )
  })

  it('preserves null description and null label verbatim', () => {
    const bytes = serializeContent(
      validContent({
        description: null,
        links: [{ url: 'https://x.example', label: null }],
      }),
    )
    const json = new TextDecoder().decode(bytes)
    expect(json).toContain('"description":null')
    expect(json).toContain('"label":null')
  })

  it('round-trips through parseContentPlaintext', () => {
    const content = validContent()
    const bytes = serializeContent(content)
    expect(parseContentPlaintext(bytes)).toEqual(content)
  })

  it('preserves non-ASCII/astral content byte-for-byte with no normalization', () => {
    const content = validContent({ title: 'emoji \u{1F600} and café' })
    const bytes = serializeContent(content)
    expect(parseContentPlaintext(bytes).title).toBe('emoji \u{1F600} and café')
  })

  it('rejects an unrecognized schemaVersion', () => {
    expect(() =>
      serializeContent(validContent({ schemaVersion: 2 as never })),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects zero links', () => {
    expect(() => serializeContent(validContent({ links: [] }))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects more than 25 links', () => {
    const links = Array.from({ length: 26 }, (_, i) => ({
      url: `https://example.com/${i}`,
      label: null,
    }))
    expect(() => serializeContent(validContent({ links }))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('accepts exactly 1 and exactly 25 links', () => {
    expect(() =>
      serializeContent(
        validContent({ links: [{ url: 'https://a', label: null }] }),
      ),
    ).not.toThrow()
    const links25 = Array.from({ length: 25 }, (_, i) => ({
      url: `https://example.com/${i}`,
      label: null,
    }))
    expect(() =>
      serializeContent(validContent({ links: links25 })),
    ).not.toThrow()
  })

  it('rejects content whose serialized bytes exceed the 1 MiB ceiling', () => {
    const content = validContent({
      title: 'a'.repeat(MAX_CONTENT_PLAINTEXT_BYTES),
    })
    expect(() => serializeContent(content)).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('accepts content at exactly the 1 MiB ceiling', () => {
    // Pad title so the whole serialized JSON lands exactly at the limit.
    const base = validContent({ title: '' })
    const baseLength = serializeContent(base).length
    const padded = validContent({
      title: 'a'.repeat(MAX_CONTENT_PLAINTEXT_BYTES - baseLength),
    })
    expect(serializeContent(padded).length).toBe(MAX_CONTENT_PLAINTEXT_BYTES)
  })
})

describe('parseContentPlaintext', () => {
  it('rejects invalid UTF-8', () => {
    // A lone continuation byte is never valid UTF-8.
    expect(() => parseContentPlaintext(new Uint8Array([0x80, 0x80]))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })

  it('rejects invalid JSON', () => {
    expect(() =>
      parseContentPlaintext(new TextEncoder().encode('not json')),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects well-formed JSON that is the wrong shape', () => {
    expect(() =>
      parseContentPlaintext(
        new TextEncoder().encode(JSON.stringify({ foo: 'bar' })),
      ),
    ).toThrow(PrivateEnvelopeValidationError)
  })

  it('rejects a link missing a url', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      title: 't',
      description: null,
      links: [{ label: 'x' }],
    })
    expect(() => parseContentPlaintext(new TextEncoder().encode(bad))).toThrow(
      PrivateEnvelopeValidationError,
    )
  })
})
