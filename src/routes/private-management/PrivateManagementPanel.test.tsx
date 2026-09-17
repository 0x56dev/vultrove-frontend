import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { PrivateManagementPanel } from './PrivateManagementPanel'
import { ApiError } from '../../api/client'
import * as privateTroves from '../../api/private-troves'
import { generateTroveId } from '../../crypto/ids'
import { createPrivateEnvelope } from '../../crypto/private-envelope'
import { encodeFragment } from '../../crypto/private-fragment'
import { buildPrivateShareUrl } from '../../api/urls'

vi.mock('../../api/private-troves', () => ({
  updatePrivateTrove: vi.fn(),
}))

const mockedUpdatePrivateTrove = vi.mocked(privateTroves.updatePrivateTrove)

function renderPanel(
  envelope: Awaited<ReturnType<typeof createPrivateEnvelope>>['envelope'],
) {
  return render(
    <PrivateManagementPanel
      troveId={troveId}
      managementId="mgmt-1"
      managementSecret="the-management-secret"
      envelope={envelope}
      expiresAt={null}
    />,
  )
}

const troveId = generateTroveId()
const content = {
  schemaVersion: 1 as const,
  title: 'Original title',
  description: null,
  links: [{ url: 'https://example.com/x', label: null }],
}

beforeEach(() => {
  mockedUpdatePrivateTrove.mockReset()
})

describe('PrivateManagementPanel: crypto.subtle unavailable (e.g. an insecure-context LAN dev origin)', () => {
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

  it('shows a distinct, actionable message on unlock, not the generic open-failure text', async () => {
    // Built with crypto.subtle available (outside this describe block's
    // effect) is not possible here since createPrivateEnvelope also
    // needs crypto.subtle — so this envelope is a structurally-valid
    // plain-mode placeholder; the unlock attempt must fail on the
    // crypto-availability check before ever reaching AEAD verification.
    const placeholderEnvelope = {
      v: 1 as const,
      alg: 'AES-256-GCM' as const,
      mode: 'plain' as const,
      nonce: 'A'.repeat(16),
      ciphertext: 'A'.repeat(24),
    }
    renderPanel(placeholderEnvelope)

    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      { target: { value: 'v1.' + 'A'.repeat(43) } },
    )
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/secure context/i),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/https/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /could not open this trove/i,
    )
  })
})

describe('PrivateManagementPanel: saving an edit', () => {
  it('never issues a second updatePrivateTrove call from a duplicate submit racing the disabled state', async () => {
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content,
    )
    const fragment = encodeFragment(fragmentSecret)
    mockedUpdatePrivateTrove.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                troveId,
                mode: 'private',
                envelope,
                expiresAt: null,
              }),
            20,
          ),
        ),
    )

    renderPanel(envelope)
    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      { target: { value: fragment } },
    )
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await screen.findByDisplayValue('Original title')

    const form = screen
      .getByRole('button', { name: 'Save changes' })
      .closest('form')!
    // Two submits dispatched inside the *same* `act()` batch: both
    // handler invocations close over the same not-yet-re-rendered
    // `submitting` prop (still `false`), exactly reproducing a real
    // double-click/double-Enter race that outruns TroveForm's own
    // `submitting`-gated disabled state — the case
    // `editSubmissionInFlight` exists to guard against, mirroring
    // CreateTrovePage's identical Argon2id guard. Two ordinary,
    // act()-wrapped `fireEvent.submit` calls would each flush state
    // between them and never actually race.
    act(() => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })

    await waitFor(() =>
      expect(mockedUpdatePrivateTrove).toHaveBeenCalledTimes(1),
    )
    await waitFor(() =>
      expect(screen.getByText(/share link has changed/i)).toBeInTheDocument(),
    )
    expect(mockedUpdatePrivateTrove).toHaveBeenCalledTimes(1)
  })

  it('shows the rotated share link right after the Save changes button, not above the form, and focuses it', async () => {
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content,
    )
    const fragment = encodeFragment(fragmentSecret)
    const { envelope: newEnvelope } = await createPrivateEnvelope(
      troveId,
      content,
    )
    mockedUpdatePrivateTrove.mockResolvedValue({
      troveId,
      mode: 'private',
      envelope: newEnvelope,
      expiresAt: null,
    })

    renderPanel(envelope)
    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      { target: { value: fragment } },
    )
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await screen.findByDisplayValue('Original title')

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const heading = await screen.findByRole('heading', {
      name: /share link has changed/i,
    })
    const notice = heading.closest('section')!
    const shareUrlPrefix = buildPrivateShareUrl(troveId, '')
    const newShareUrl = (
      screen.getByLabelText('New share link') as HTMLInputElement
    ).value
    // The rotated URL is derived from a fresh, client-side-generated
    // fragment secret (docs/PRIVATE_ENVELOPE.md §17) — not predictable
    // from the mocked API response — so this only checks shape and that
    // it's not the pre-rotation link.
    expect(newShareUrl.startsWith(shareUrlPrefix)).toBe(true)
    expect(newShareUrl).not.toBe(buildPrivateShareUrl(troveId, fragment))

    // Placed after the Save changes button in the DOM, not above the form.
    const saveButton = screen.getByRole('button', { name: 'Save changes' })
    expect(
      saveButton.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await waitFor(() => expect(notice).toHaveFocus())
  })

  it('replaces the rotated-link notice with the latest URL on a second edit, rather than leaving a stale one', async () => {
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content,
    )
    const fragment = encodeFragment(fragmentSecret)
    const firstRotation = await createPrivateEnvelope(troveId, content)
    const secondRotation = await createPrivateEnvelope(troveId, content)
    mockedUpdatePrivateTrove
      .mockResolvedValueOnce({
        troveId,
        mode: 'private',
        envelope: firstRotation.envelope,
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        troveId,
        mode: 'private',
        envelope: secondRotation.envelope,
        expiresAt: null,
      })

    renderPanel(envelope)
    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      { target: { value: fragment } },
    )
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await screen.findByDisplayValue('Original title')

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mockedUpdatePrivateTrove).toHaveBeenCalledTimes(1),
    )
    const firstUrl = (
      await screen.findByLabelText('New share link')
    ).getAttribute('value')!

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mockedUpdatePrivateTrove).toHaveBeenCalledTimes(2),
    )
    await waitFor(() => {
      const secondUrl = (
        screen.getByLabelText('New share link') as HTMLInputElement
      ).value
      expect(secondUrl).not.toBe(firstUrl)
    })
    expect(screen.queryByDisplayValue(firstUrl)).not.toBeInTheDocument()
    // Exactly one notice/field on screen — the old one was replaced, not
    // left behind alongside the new one.
    expect(screen.getAllByLabelText('New share link')).toHaveLength(1)
  })

  it('shows a safe-to-display error from a failed save without crashing', async () => {
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      content,
    )
    const fragment = encodeFragment(fragmentSecret)
    mockedUpdatePrivateTrove.mockRejectedValue(
      new ApiError('payload_too_large', 'The request body is too large.', 413),
    )

    renderPanel(envelope)
    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      { target: { value: fragment } },
    )
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await screen.findByDisplayValue('Original title')

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(
        screen.getByText('The request body is too large.'),
      ).toBeInTheDocument(),
    )
  })
})
