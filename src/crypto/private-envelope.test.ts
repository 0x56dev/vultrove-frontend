import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateTroveId } from './ids'
import {
  createPrivateEnvelope,
  openPrivateEnvelope,
  generateContentKey,
  generateFragmentSecret,
} from './private-envelope'
import { parsePrivateEnvelope } from './private-envelope-validation'
import { encodeFragment } from './private-fragment'
import { base64UrlEncode } from './base64url'
import {
  PrivateEnvelopeValidationError,
  PrivateCryptoUnavailableError,
} from './private-envelope-errors'
import type { PrivateContentPlaintext, PrivateEnvelope } from './private-trove'

function content(
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

describe('createPrivateEnvelope / openPrivateEnvelope round trips', () => {
  it('plain mode: round-trips content, and the returned fragmentSecret is the content key itself', async () => {
    const troveId = generateTroveId()
    const c = content()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(troveId, c)

    expect(envelope.mode).toBe('plain')
    const opened = await openPrivateEnvelope(troveId, envelope, fragmentSecret)
    expect(opened).toEqual(c)
  })

  it('password mode: round-trips content given the fragment secret and correct password', async () => {
    const troveId = generateTroveId()
    const c = content()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      c,
      'hunter2',
    )

    expect(envelope.mode).toBe('password')
    const opened = await openPrivateEnvelope(
      troveId,
      envelope,
      fragmentSecret,
      'hunter2',
    )
    expect(opened).toEqual(c)
  }, 20_000)

  it('the fragment (as shown in a share URL) round-trips via encodeFragment/parseFragment end to end', async () => {
    const troveId = generateTroveId()
    const c = content()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(troveId, c)
    const fragmentText = encodeFragment(fragmentSecret)

    // Simulate: creator copies the share URL, later a viewer's browser
    // reads window.location.hash and parses it back.
    const { parseFragment } = await import('./private-fragment')
    const recoveredSecret = parseFragment(fragmentText)
    const opened = await openPrivateEnvelope(troveId, envelope, recoveredSecret)
    expect(opened).toEqual(c)
  })

  it('round-trips a full envelope through JSON stringify/parsePrivateEnvelope (as it would cross the wire)', async () => {
    const troveId = generateTroveId()
    const c = content()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      c,
      'hunter2',
    )

    const raw = JSON.stringify(envelope)
    const parsed = parsePrivateEnvelope(raw)
    const opened = await openPrivateEnvelope(
      troveId,
      parsed,
      fragmentSecret,
      'hunter2',
    )
    expect(opened).toEqual(c)
  }, 20_000)

  it('never includes plaintext title/description/url in the envelope JSON', async () => {
    const troveId = generateTroveId()
    const c = content({
      title: 'UNMISTAKABLE-SECRET-TITLE',
      description: 'UNMISTAKABLE-SECRET-DESCRIPTION',
      links: [
        {
          url: 'https://UNMISTAKABLE-SECRET-URL.example',
          label: 'UNMISTAKABLE-LABEL',
        },
      ],
    })
    const { envelope } = await createPrivateEnvelope(troveId, c)
    const raw = JSON.stringify(envelope)
    expect(raw).not.toContain('UNMISTAKABLE')
  })

  it('never includes the password or fragment secret in the envelope JSON', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
      'UNMISTAKABLE-PASSWORD-VALUE',
    )
    const raw = JSON.stringify(envelope)
    expect(raw).not.toContain('UNMISTAKABLE-PASSWORD-VALUE')
    expect(raw).not.toContain(base64UrlEncode(fragmentSecret))
  })
})

describe('key/nonce freshness (docs/V0.1_SPEC.md §6: full rotation on every edit)', () => {
  it('two creations of identical content never share a nonce, ciphertext, or fragment secret', async () => {
    const troveId = generateTroveId()
    const c = content()
    const first = await createPrivateEnvelope(troveId, c)
    const second = await createPrivateEnvelope(troveId, c)

    expect(first.envelope.nonce).not.toBe(second.envelope.nonce)
    expect(first.envelope.ciphertext).not.toBe(second.envelope.ciphertext)
    expect(base64UrlEncode(first.fragmentSecret)).not.toBe(
      base64UrlEncode(second.fragmentSecret),
    )
  })

  it('two creations in password mode never share a wrap nonce, wrapped ciphertext, or fragment secret, even with the same password', async () => {
    const troveId = generateTroveId()
    const c = content()
    const first = await createPrivateEnvelope(troveId, c, 'same password')
    const second = await createPrivateEnvelope(troveId, c, 'same password')

    if (
      first.envelope.mode !== 'password' ||
      second.envelope.mode !== 'password'
    ) {
      throw new Error('expected password mode')
    }
    expect(first.envelope.wrappedKey.nonce).not.toBe(
      second.envelope.wrappedKey.nonce,
    )
    expect(first.envelope.wrappedKey.ciphertext).not.toBe(
      second.envelope.wrappedKey.ciphertext,
    )
    expect(base64UrlEncode(first.fragmentSecret)).not.toBe(
      base64UrlEncode(second.fragmentSecret),
    )
  }, 20_000)

  it('an old fragment/content key no longer decrypts a replacement envelope (edit invalidates the previous share capability)', async () => {
    const troveId = generateTroveId()
    const original = await createPrivateEnvelope(
      troveId,
      content({ title: 'v1' }),
    )
    const edited = await createPrivateEnvelope(
      troveId,
      content({ title: 'v2' }),
    )

    // The old fragment against the new (replacement) envelope must fail.
    const staleAttempt = await openPrivateEnvelope(
      troveId,
      edited.envelope,
      original.fragmentSecret,
    )
    expect(staleAttempt).toBeNull()

    // The new fragment still works against the new envelope.
    const freshAttempt = await openPrivateEnvelope(
      troveId,
      edited.envelope,
      edited.fragmentSecret,
    )
    expect(freshAttempt).toEqual(content({ title: 'v2' }))
  })
})

describe('AAD-bound trove ID (docs/PRIVATE_ENVELOPE.md §10: prevents cross-record relocation)', () => {
  it('rejects (returns null) when opened under a different trove ID than it was created for', async () => {
    const realTroveId = generateTroveId()
    const otherTroveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      realTroveId,
      content(),
    )

    const opened = await openPrivateEnvelope(
      otherTroveId,
      envelope,
      fragmentSecret,
    )
    expect(opened).toBeNull()
  })

  it('rejects a relocated password-mode envelope the same way', async () => {
    const realTroveId = generateTroveId()
    const otherTroveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      realTroveId,
      content(),
      'hunter2',
    )

    const opened = await openPrivateEnvelope(
      otherTroveId,
      envelope,
      fragmentSecret,
      'hunter2',
    )
    expect(opened).toBeNull()
  }, 20_000)
})

describe('decryption failure collapses to a single, undistinguished outcome (docs/PRIVATE_ENVELOPE.md §18)', () => {
  it('wrong fragment secret (plain mode) returns null', async () => {
    const troveId = generateTroveId()
    const { envelope } = await createPrivateEnvelope(troveId, content())
    const wrongSecret = generateContentKey()
    expect(await openPrivateEnvelope(troveId, envelope, wrongSecret)).toBeNull()
  })

  it('wrong password (password mode) returns null', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
      'right',
    )
    expect(
      await openPrivateEnvelope(troveId, envelope, fragmentSecret, 'wrong'),
    ).toBeNull()
  }, 20_000)

  it('wrong fragment secret (password mode) returns null even with the correct password', async () => {
    const troveId = generateTroveId()
    const { envelope } = await createPrivateEnvelope(
      troveId,
      content(),
      'hunter2',
    )
    const wrongFragment = generateFragmentSecret()
    expect(
      await openPrivateEnvelope(troveId, envelope, wrongFragment, 'hunter2'),
    ).toBeNull()
  }, 20_000)

  it('tampered content ciphertext returns null', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
    )
    const tampered: PrivateEnvelope = {
      ...envelope,
      ciphertext: flipLastByte(envelope.ciphertext),
    }
    expect(
      await openPrivateEnvelope(troveId, tampered, fragmentSecret),
    ).toBeNull()
  })

  it('tampered wrappedKey ciphertext returns null (password mode)', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
      'hunter2',
    )
    if (envelope.mode !== 'password') throw new Error('expected password mode')
    const tampered: PrivateEnvelope = {
      ...envelope,
      wrappedKey: {
        ...envelope.wrappedKey,
        ciphertext: flipLastByte(envelope.wrappedKey.ciphertext),
      },
    }
    expect(
      await openPrivateEnvelope(troveId, tampered, fragmentSecret, 'hunter2'),
    ).toBeNull()
  }, 20_000)

  it('tampered nonce returns null', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
    )
    const tampered: PrivateEnvelope = {
      ...envelope,
      nonce: flipLastByte(envelope.nonce),
    }
    expect(
      await openPrivateEnvelope(troveId, tampered, fragmentSecret),
    ).toBeNull()
  })
})

function flipLastByte(base64url: string): string {
  const bytes = new Uint8Array(atobUrl(base64url))
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff
  return base64UrlEncode(bytes)
}

function atobUrl(text: string): number[] {
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(padded)
  return Array.from(binary, (c) => c.charCodeAt(0))
}

describe('openPrivateEnvelope: structural/pre-crypto validation errors (thrown, not null)', () => {
  it('throws for a wrong-length fragment secret', async () => {
    const troveId = generateTroveId()
    const { envelope } = await createPrivateEnvelope(troveId, content())
    await expect(
      openPrivateEnvelope(troveId, envelope, new Uint8Array(16)),
    ).rejects.toBeInstanceOf(PrivateEnvelopeValidationError)
  })

  it('throws when a password-mode envelope is opened with no password', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
      'hunter2',
    )
    await expect(
      openPrivateEnvelope(troveId, envelope, fragmentSecret),
    ).rejects.toBeInstanceOf(PrivateEnvelopeValidationError)
  }, 20_000)

  it('throws (defense in depth) for a hand-constructed envelope with tuned kdf.params, even bypassing parsePrivateEnvelope', async () => {
    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content(),
      'hunter2',
    )
    if (envelope.mode !== 'password') throw new Error('expected password mode')
    const tuned: PrivateEnvelope = {
      ...envelope,
      kdf: {
        ...envelope.kdf,
        params: base64UrlEncode(new Uint8Array(19).fill(1)),
      },
    }
    await expect(
      openPrivateEnvelope(troveId, tuned, fragmentSecret, 'hunter2'),
    ).rejects.toBeInstanceOf(PrivateEnvelopeValidationError)
  }, 20_000)
})

describe('createPrivateEnvelope: size ceilings', () => {
  it('rejects oversized content plaintext before ever calling into crypto', async () => {
    const troveId = generateTroveId()
    await expect(
      createPrivateEnvelope(troveId, content({ title: 'a'.repeat(2_000_000) })),
    ).rejects.toBeInstanceOf(PrivateEnvelopeValidationError)
  })
})

describe('crypto.subtle unavailable (e.g. an insecure-context page load)', () => {
  let originalSubtle: SubtleCrypto

  beforeEach(() => {
    originalSubtle = crypto.subtle
    Object.defineProperty(crypto, 'subtle', {
      value: undefined,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(crypto, 'subtle', {
      value: originalSubtle,
      configurable: true,
    })
  })

  it('createPrivateEnvelope throws PrivateCryptoUnavailableError, not a raw TypeError, before touching the network-bound fields', async () => {
    const troveId = generateTroveId()
    await expect(
      createPrivateEnvelope(troveId, content()),
    ).rejects.toBeInstanceOf(PrivateCryptoUnavailableError)
  })

  it('openPrivateEnvelope also throws PrivateCryptoUnavailableError rather than attempting to decrypt', async () => {
    const troveId = generateTroveId()
    const fragmentSecret = generateFragmentSecret()
    const envelope: PrivateEnvelope = {
      v: 1,
      alg: 'AES-256-GCM',
      mode: 'plain',
      nonce: base64UrlEncode(new Uint8Array(12)),
      ciphertext: base64UrlEncode(new Uint8Array(16)),
    }
    await expect(
      openPrivateEnvelope(troveId, envelope, fragmentSecret),
    ).rejects.toBeInstanceOf(PrivateCryptoUnavailableError)
  })
})
