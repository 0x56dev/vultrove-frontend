import { describe, it, expect } from 'vitest'
import {
  generatePepper,
  computeManagementVerifier,
  verifyManagementSecret,
} from './management'
import { generateManagementSecret } from './ids'

describe('management secret verifier boundary', () => {
  it('computes a 32-byte HMAC-SHA-256 verifier over the decoded secret', async () => {
    const pepper = generatePepper()
    const secret = generateManagementSecret()
    const verifier = await computeManagementVerifier(secret, pepper)
    expect(verifier).not.toBeNull()
    expect(verifier!.length).toBe(32)
  })

  it('verifies a correct secret against its own verifier', async () => {
    const pepper = generatePepper()
    const secret = generateManagementSecret()
    const verifier = await computeManagementVerifier(secret, pepper)
    const ok = await verifyManagementSecret(secret, verifier!, pepper)
    expect(ok).toBe(true)
  })

  it('rejects an incorrect (but well-formed) secret', async () => {
    const pepper = generatePepper()
    const secret = generateManagementSecret()
    const verifier = await computeManagementVerifier(secret, pepper)
    const wrongSecret = generateManagementSecret()
    const ok = await verifyManagementSecret(wrongSecret, verifier!, pepper)
    expect(ok).toBe(false)
  })

  it('rejects a malformed (non-base64url) secret without throwing', async () => {
    const pepper = generatePepper()
    const secret = generateManagementSecret()
    const verifier = await computeManagementVerifier(secret, pepper)
    await expect(
      verifyManagementSecret('not valid base64url!!', verifier!, pepper),
    ).resolves.toBe(false)
  })

  it('rejects a secret that decodes to the wrong byte length', async () => {
    const pepper = generatePepper()
    const secret = generateManagementSecret()
    const verifier = await computeManagementVerifier(secret, pepper)
    // 16 bytes of valid base64url, not 32 — same alphabet, wrong length.
    const wrongLength = 'AAAAAAAAAAAAAAAAAAAAAA'
    await expect(
      verifyManagementSecret(wrongLength, verifier!, pepper),
    ).resolves.toBe(false)
  })

  it('produces a different verifier under a different pepper', async () => {
    const secret = generateManagementSecret()
    const verifierA = await computeManagementVerifier(secret, generatePepper())
    const verifierB = await computeManagementVerifier(secret, generatePepper())
    expect(Array.from(verifierA!)).not.toEqual(Array.from(verifierB!))
  })

  it('computeManagementVerifier returns null for a malformed secret', async () => {
    const pepper = generatePepper()
    expect(await computeManagementVerifier('!!!', pepper)).toBeNull()
  })
})
