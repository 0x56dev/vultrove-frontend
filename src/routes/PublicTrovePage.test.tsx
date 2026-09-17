import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PublicTrovePage } from './PublicTrovePage'
import { ApiError } from '../api/client'
import * as standardTroves from '../api/standard-troves'
import * as privateTroves from '../api/private-troves'
import { generateTroveId } from '../crypto/ids'
import { createPrivateEnvelope } from '../crypto/private-envelope'
import { encodeFragment } from '../crypto/private-fragment'

vi.mock('../api/standard-troves', () => ({
  unlockStandardTrove: vi.fn(),
}))

vi.mock('../api/private-troves', () => ({
  getTrove: vi.fn(),
}))

function renderAt(path: string, hash = '') {
  window.location.hash = hash
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:troveId" element={<PublicTrovePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const mockedGetPublicTrove = vi.mocked(privateTroves.getTrove)
const mockedUnlockStandardTrove = vi.mocked(standardTroves.unlockStandardTrove)

beforeEach(() => {
  mockedGetPublicTrove.mockReset()
  mockedUnlockStandardTrove.mockReset()
  window.location.hash = ''
})

describe('PublicTrovePage', () => {
  it('shows a loading state before the fetch resolves', () => {
    mockedGetPublicTrove.mockReturnValue(new Promise(() => {}))
    renderAt('/c/abc123')
    expect(screen.getByText(/loading trove/i)).toBeInTheDocument()
  })

  it('renders title, description, and links on success', async () => {
    mockedGetPublicTrove.mockResolvedValue({
      mode: 'standard',
      title: 'My mirrors',
      description: 'Some mirrors of a file',
      links: [
        { url: 'https://example.com/a', label: 'Mirror A' },
        { url: 'https://example.com/b', label: null },
      ],
      expiresAt: '2026-06-01T12:00:00.000Z',
      passwordProtected: false,
    })

    renderAt('/c/abc123')

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'My mirrors' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Some mirrors of a file')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mirror A' })).toHaveAttribute(
      'href',
      'https://example.com/a',
    )
    expect(
      screen.getByRole('link', { name: 'https://example.com/b' }),
    ).toBeInTheDocument()
  })

  it('renders title/description as plain text, never interpreting them as HTML', async () => {
    mockedGetPublicTrove.mockResolvedValue({
      mode: 'standard',
      title: '<b>bold title</b>',
      description: '<img src=x onerror=alert(1)>',
      links: [{ url: 'https://example.com/a', label: null }],
      expiresAt: null,
      passwordProtected: false,
    })

    renderAt('/c/abc123')

    await waitFor(() =>
      expect(screen.getByText('<b>bold title</b>')).toBeInTheDocument(),
    )
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('b')).not.toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('gives outbound links safe attributes (target=_blank, rel=noopener noreferrer)', async () => {
    mockedGetPublicTrove.mockResolvedValue({
      mode: 'standard',
      title: 'My mirrors',
      description: null,
      links: [{ url: 'https://example.com/a', label: 'A' }],
      expiresAt: null,
      passwordProtected: false,
    })

    renderAt('/c/abc123')

    const link = await screen.findByRole('link', { name: 'A' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows a generic not-found state for a 404 (unknown/expired/deleted/disabled, collapsed)', async () => {
    mockedGetPublicTrove.mockRejectedValue(
      new ApiError('not_found', 'This trove is not available.', 404),
    )

    renderAt('/c/abc123')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/not available/i),
    )
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('shows a distinct unexpected-error state for a non-404 failure', async () => {
    mockedGetPublicTrove.mockRejectedValue(
      new ApiError('internal_error', 'An unexpected error occurred.', 500),
    )

    renderAt('/c/abc123')

    await waitFor(() =>
      expect(
        screen.getByText('An unexpected error occurred.'),
      ).toBeInTheDocument(),
    )
  })

  it('shows a generic error for a network failure', async () => {
    mockedGetPublicTrove.mockRejectedValue(
      new ApiError(
        'network_error',
        'Something went wrong talking to Vultrove. Please try again.',
        null,
      ),
    )

    renderAt('/c/abc123')

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // A network failure (including the client's own request-timeout
    // guard, `src/api/client.ts`'s `AbortSignal.timeout`, firing on a
    // request that never otherwise settles) must always leave 'loading'
    // — never leave the page stuck on it indefinitely.
    expect(screen.queryByText(/loading trove/i)).not.toBeInTheDocument()
  })

  it('shows a finite error state, not permanent loading, for a response whose mode this client does not recognize', async () => {
    mockedGetPublicTrove.mockResolvedValue({
      // A malformed/future/unsupported response shape — neither the
      // Standard nor the Private discriminant this client understands.
      mode: 'something-unexpected',
    } as unknown as Awaited<ReturnType<typeof privateTroves.getTrove>>)

    renderAt('/c/abc123')

    await waitFor(() =>
      expect(screen.queryByText(/loading trove/i)).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /password required/i }),
    ).not.toBeInTheDocument()
  })

  describe('password-protected trove', () => {
    function lockedResponse(expiresAt: string | null = null) {
      return {
        mode: 'standard' as const,
        passwordProtected: true as const,
        expiresAt,
      }
    }

    function unlockedResponse() {
      return {
        mode: 'standard' as const,
        title: 'Secret mirrors',
        description: 'Only visible once unlocked',
        links: [{ url: 'https://example.com/secret', label: 'Secret link' }],
        expiresAt: null,
        passwordProtected: true as const,
      }
    }

    it('shows a password prompt instead of content, with no title/description/links visible', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      renderAt('/c/abc123')

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /password required/i }),
        ).toBeInTheDocument(),
      )
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.queryByText('Secret mirrors')).not.toBeInTheDocument()
    })

    it('transitions out of "Loading trove…" as soon as the locked GET resolves, rather than staying on it', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      renderAt('/c/abc123')

      expect(screen.getByText(/loading trove/i)).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.queryByText(/loading trove/i)).not.toBeInTheDocument(),
      )
      expect(
        screen.getByRole('heading', { name: /password required/i }),
      ).toBeInTheDocument()
    })

    it('shows the expiry from the locked response', async () => {
      mockedGetPublicTrove.mockResolvedValue(
        lockedResponse('2026-06-01T12:00:00.000Z'),
      )
      renderAt('/c/abc123')

      await waitFor(() =>
        expect(screen.getByText(/expires/i)).toBeInTheDocument(),
      )
    })

    it('never issues an unlock request before the user submits a password', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      expect(mockedUnlockStandardTrove).not.toHaveBeenCalled()
    })

    it('reveals the trove content after a correct password is submitted', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockResolvedValue(unlockedResponse())
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'hunter2' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      expect(mockedUnlockStandardTrove).toHaveBeenCalledWith(
        'abc123',
        'hunter2',
      )
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'Secret mirrors' }),
        ).toBeInTheDocument(),
      )
      expect(screen.getByText('Only visible once unlocked')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Secret link' })).toHaveAttribute(
        'href',
        'https://example.com/secret',
      )
    })

    it('shows a generic error and stays on the prompt for a wrong password', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockRejectedValue(
        new ApiError('unauthorized', 'Incorrect password.', 401),
      )
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'wrong' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Incorrect password.',
        ),
      )
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Secret mirrors' }),
      ).not.toBeInTheDocument()
    })

    it('does not reveal whether the trove is protected beyond what the locked GET already disclosed', async () => {
      // Two independent failure causes (wrong password vs. a trove that
      // turned out not to be protected at all) must produce identical,
      // generic text — this UI has no way to tell them apart, and
      // shouldn't need to.
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockRejectedValue(
        new ApiError('unauthorized', 'Incorrect password.', 401),
      )
      renderAt('/c/abc123')
      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'anything' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
      const text = await screen.findByRole('alert')
      expect(text).toHaveTextContent('Incorrect password.')
    })

    it('treats a not-found response from unlock (e.g. the trove expired mid-prompt) as the standard not-found state', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockRejectedValue(
        new ApiError('not_found', 'This trove is not available.', 404),
      )
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'hunter2' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/not available/i),
      )
    })

    it('disables the unlock button while submitting', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockReturnValue(new Promise(() => {}))
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'hunter2' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /checking/i }),
        ).toBeDisabled(),
      )
    })

    it('disables the unlock button until a password is entered', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      expect(screen.getByRole('button', { name: /unlock/i })).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'a' },
      })
      expect(screen.getByRole('button', { name: /unlock/i })).not.toBeDisabled()
    })

    it('never puts the submitted password in the URL', async () => {
      mockedGetPublicTrove.mockResolvedValue(lockedResponse())
      mockedUnlockStandardTrove.mockResolvedValue(unlockedResponse())
      renderAt('/c/abc123')

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'super-secret-password-value' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(() => expect(mockedUnlockStandardTrove).toHaveBeenCalled())
      expect(window.location.href).not.toContain('super-secret-password-value')
      expect(window.location.hash).toBe('')
    })
  })

  describe('Private trove', () => {
    const troveId = generateTroveId()
    const content = {
      schemaVersion: 1 as const,
      title: 'Private title',
      description: 'Private description',
      links: [{ url: 'https://example.com/private', label: 'Secret' }],
    }

    it('decrypts and renders plain-mode content with no prompt, using only the fragment', async () => {
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
      )
      const fragment = encodeFragment(fragmentSecret)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })

      renderAt(`/c/${troveId}`, `#${fragment}`)

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'Private title' }),
        ).toBeInTheDocument(),
      )
      expect(screen.getByText('Private description')).toBeInTheDocument()
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    })

    it('shows a local password prompt for password-mode, and never issues a network request to check it', async () => {
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
        'correct-horse-battery-staple',
      )
      const fragment = encodeFragment(fragmentSecret)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      renderAt(`/c/${troveId}`, `#${fragment}`)

      await screen.findByLabelText('Password')
      expect(mockedUnlockStandardTrove).not.toHaveBeenCalled()
      // `getTrove` is mocked above (it already resolved), so any call
      // captured here would be a *second*, unexpected network request —
      // there is no server-side "check this Private password" endpoint
      // for this component to have called.
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('decrypts and renders after the correct password is entered locally', async () => {
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
        'correct-horse-battery-staple',
      )
      const fragment = encodeFragment(fragmentSecret)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })

      renderAt(`/c/${troveId}`, `#${fragment}`)

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'correct-horse-battery-staple' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(
        () =>
          expect(
            screen.getByRole('heading', { name: 'Private title' }),
          ).toBeInTheDocument(),
        { timeout: 10000 },
      )
    }, 15000)

    it('shows a generic failure for a wrong password, with no network request and no distinguishing detail', async () => {
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
        'correct-horse-battery-staple',
      )
      const fragment = encodeFragment(fragmentSecret)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      renderAt(`/c/${troveId}`, `#${fragment}`)

      await screen.findByLabelText('Password')
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'totally-wrong-password' },
      })
      fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

      await waitFor(
        () => expect(screen.getByRole('alert')).toBeInTheDocument(),
        { timeout: 10000 },
      )
      expect(
        screen.queryByRole('heading', { name: 'Private title' }),
      ).not.toBeInTheDocument()
      // `getTrove` is mocked above — the wrong-password check never
      // touches the network at all (no server-side oracle exists).
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    }, 15000)

    it('shows a generic failure for a missing fragment, without attempting decryption', async () => {
      const { envelope } = await createPrivateEnvelope(troveId, content)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })

      renderAt(`/c/${troveId}`, '')

      await waitFor(() =>
        expect(screen.getByText(/incomplete/i)).toBeInTheDocument(),
      )
    })

    it('shows a generic failure for a malformed fragment', async () => {
      const { envelope } = await createPrivateEnvelope(troveId, content)
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope,
        expiresAt: null,
      })

      renderAt(`/c/${troveId}`, '#not-a-real-fragment')

      await waitFor(() =>
        expect(screen.getByText(/incomplete/i)).toBeInTheDocument(),
      )
    })

    it('shows a generic failure for a tampered envelope (bad ciphertext)', async () => {
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
      )
      const fragment = encodeFragment(fragmentSecret)
      const tampered = {
        ...envelope,
        ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA',
      }
      mockedGetPublicTrove.mockResolvedValue({
        mode: 'private',
        envelope: tampered,
        expiresAt: null,
      })

      renderAt(`/c/${troveId}`, `#${fragment}`)

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    })

    // Fragment-never-leaves-the-browser at the real HTTP layer is verified
    // in `sensitive-data-flow.test.tsx`, which deliberately does *not*
    // mock `../api/private-troves` (unlike every test above) so it
    // exercises the real `fetch` call this component's data layer makes.
  })
})
