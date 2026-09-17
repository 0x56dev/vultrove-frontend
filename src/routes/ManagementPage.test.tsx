import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ManagementPage } from './ManagementPage'
import { ApiError } from '../api/client'
import * as standardTroves from '../api/standard-troves'
import * as privateTroves from '../api/private-troves'

vi.mock('../api/standard-troves', () => ({
  updateStandardTrove: vi.fn(),
  deleteTrove: vi.fn(),
}))

vi.mock('../api/private-troves', () => ({
  getManagementViewAny: vi.fn(),
  updatePrivateTrove: vi.fn(),
}))

const mockedGetManagementView = vi.mocked(privateTroves.getManagementViewAny)
const mockedUpdateStandardTrove = vi.mocked(standardTroves.updateStandardTrove)
const mockedDeleteTrove = vi.mocked(standardTroves.deleteTrove)

function renderAt(path: string, hash = '') {
  window.location.hash = hash
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/m/:managementId" element={<ManagementPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const view = {
  mode: 'standard' as const,
  troveId: 'trove-1',
  title: 'My mirrors',
  description: 'A description',
  links: [{ url: 'https://example.com/a', label: 'A' }],
  expiresAt: '2026-06-01T12:00:00.000Z',
  passwordProtected: false as const,
}

const protectedView = { ...view, passwordProtected: true as const }

beforeEach(() => {
  mockedGetManagementView.mockReset()
  mockedUpdateStandardTrove.mockReset()
  mockedDeleteTrove.mockReset()
  window.location.hash = ''
})

describe('missing/empty fragment', () => {
  it('shows an invalid-link state without ever calling the API', async () => {
    renderAt('/m/mgmt1', '')

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
    expect(mockedGetManagementView).not.toHaveBeenCalled()
  })
})

describe('loading and prefill', () => {
  it('shows a loading state, then prefills the form from the authenticated response', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    expect(screen.getByText(/loading management view/i)).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByDisplayValue('My mirrors')).toBeInTheDocument(),
    )
    expect(screen.getByDisplayValue('A description')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('https://example.com/a'),
    ).toBeInTheDocument()
    expect(mockedGetManagementView).toHaveBeenCalledWith('mgmt1', 'the-secret')
  })

  it('shows a share link to the public trove using the troveId from the response', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /trove-1/i }),
      ).toBeInTheDocument(),
    )
  })
})

describe('401 handling (generic, non-enumerating)', () => {
  it('collapses an unauthorized response to the same generic invalid-link message', async () => {
    mockedGetManagementView.mockRejectedValue(
      new ApiError('unauthorized', 'nope', 401),
    )
    renderAt('/m/mgmt1', '#wrong-secret')

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
  })

  it('shows the identical message text for a missing fragment and for a server-side 401', async () => {
    const { unmount } = renderAt('/m/mgmt1', '')
    const missingFragmentText = await screen.findByText(
      /invalid or has expired/i,
    )
    const missingFragmentMessage = missingFragmentText.textContent
    unmount()

    mockedGetManagementView.mockRejectedValue(
      new ApiError('unauthorized', 'nope', 401),
    )
    renderAt('/m/mgmt1', '#wrong-secret')
    const serverRejectedText = await screen.findByText(
      /invalid or has expired/i,
    )
    expect(serverRejectedText.textContent).toBe(missingFragmentMessage)
  })
})

describe('unexpected errors', () => {
  it('shows a distinct error state for a non-401 failure', async () => {
    mockedGetManagementView.mockRejectedValue(
      new ApiError('internal_error', 'An unexpected error occurred.', 500),
    )
    renderAt('/m/mgmt1', '#secret')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'An unexpected error occurred.',
      ),
    )
  })
})

describe('edit', () => {
  it('submits a PATCH with the edited fields and updates the view from the response', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockResolvedValue({ ...view, title: 'New title' })
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New title' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateStandardTrove).toHaveBeenCalledWith(
        'mgmt1',
        'the-secret',
        expect.objectContaining({ title: 'New title' }),
      ),
    )
    // The PATCH response's title is reflected without a second authenticated fetch.
    expect(mockedGetManagementView).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByDisplayValue('New title')).toBeInTheDocument(),
    )
  })

  it('omits expiration from the PATCH body when "keep current" is left selected', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedUpdateStandardTrove).toHaveBeenCalled())
    const patchBody = mockedUpdateStandardTrove.mock.calls[0]![2]
    expect(patchBody).not.toHaveProperty('expiration')
  })

  it('includes expiration in the PATCH body once explicitly changed', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.change(screen.getByLabelText('Expiration'), {
      target: { value: '30d' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateStandardTrove).toHaveBeenCalledWith(
        'mgmt1',
        'the-secret',
        expect.objectContaining({ expiration: '30d' }),
      ),
    )
  })

  it('collapses a 401 during PATCH to the generic invalid-link state', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockRejectedValue(
      new ApiError('unauthorized', 'nope', 401),
    )
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
  })
})

describe('password protection', () => {
  it('prefills the checkbox as checked, with a blank password field, for a protected trove', async () => {
    mockedGetManagementView.mockResolvedValue(protectedView)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    expect(
      screen.getByLabelText('Require a password to view this trove'),
    ).toBeChecked()
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('leaves the checkbox unchecked for an unprotected trove', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    expect(
      screen.getByLabelText('Require a password to view this trove'),
    ).not.toBeChecked()
  })

  it('omits password from the PATCH body when a protected trove is saved with the field left blank', async () => {
    mockedGetManagementView.mockResolvedValue(protectedView)
    mockedUpdateStandardTrove.mockResolvedValue(protectedView)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedUpdateStandardTrove).toHaveBeenCalled())
    const patchBody = mockedUpdateStandardTrove.mock.calls[0]![2]
    expect(patchBody).not.toHaveProperty('password')
  })

  it('sends {enabled: true, value} to replace the password when a new one is typed', async () => {
    mockedGetManagementView.mockResolvedValue(protectedView)
    mockedUpdateStandardTrove.mockResolvedValue(protectedView)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateStandardTrove).toHaveBeenCalledWith(
        'mgmt1',
        'the-secret',
        expect.objectContaining({
          password: { enabled: true, value: 'new-password' },
        }),
      ),
    )
  })

  it('sends {enabled: false} to remove password protection when the checkbox is unchecked', async () => {
    mockedGetManagementView.mockResolvedValue(protectedView)
    mockedUpdateStandardTrove.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateStandardTrove).toHaveBeenCalledWith(
        'mgmt1',
        'the-secret',
        expect.objectContaining({ password: { enabled: false } }),
      ),
    )
  })

  it('sends {enabled: true, value} to newly enable protection on a previously unprotected trove', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockResolvedValue(protectedView)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'brand-new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateStandardTrove).toHaveBeenCalledWith(
        'mgmt1',
        'the-secret',
        expect.objectContaining({
          password: { enabled: true, value: 'brand-new-password' },
        }),
      ),
    )
  })

  it('blocks submission with a validation error when newly enabling protection with no password entered', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      screen.getByText(/enter a password, or turn off password protection/i),
    ).toBeInTheDocument()
    expect(mockedUpdateStandardTrove).not.toHaveBeenCalled()
  })

  it('reflects the PATCH response’s passwordProtected after a successful save', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedUpdateStandardTrove.mockResolvedValue(protectedView)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(
        screen.getByLabelText('Require a password to view this trove'),
      ).toBeChecked(),
    )
    // Prefilled from the fresh response, so the field is blank again —
    // never echoes the just-submitted plaintext password back.
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('never renders an entered password anywhere in the DOM outside the field itself', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    const { container } = renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'super-secret-password-value' },
    })

    const passwordField = screen.getByLabelText('Password')
    const rest = container.cloneNode(true) as HTMLElement
    const clonedField = rest.querySelector('#trove-password')
    clonedField?.remove()
    expect(rest.innerHTML).not.toContain('super-secret-password-value')
    expect(passwordField).toHaveValue('super-secret-password-value')
  })
})

describe('delete', () => {
  it('requires explicit confirmation before calling deleteTrove', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))

    expect(
      screen.getByRole('button', { name: 'Yes, delete permanently' }),
    ).toBeInTheDocument()
    expect(mockedDeleteTrove).not.toHaveBeenCalled()
  })

  it('moves focus to the confirm button when the confirmation appears', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Yes, delete permanently' }),
      ).toHaveFocus(),
    )
  })

  it('cancel returns focus to the Delete trove button and does not call deleteTrove', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.queryByRole('button', { name: 'Yes, delete permanently' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Delete trove' }),
      ).toHaveFocus(),
    )
    expect(mockedDeleteTrove).not.toHaveBeenCalled()
  })

  it('escape cancels the confirmation', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))
    fireEvent.keyDown(screen.getByRole('group', { name: 'Confirm deletion' }), {
      key: 'Escape',
    })

    expect(
      screen.queryByRole('button', { name: 'Yes, delete permanently' }),
    ).not.toBeInTheDocument()
  })

  it('deletes on confirmation and renders a deleted state without further authenticated requests', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedDeleteTrove.mockResolvedValue(undefined)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Yes, delete permanently' }),
    )

    await waitFor(() =>
      expect(screen.getByText(/has been deleted/i)).toBeInTheDocument(),
    )
    expect(mockedDeleteTrove).toHaveBeenCalledTimes(1)
    expect(mockedDeleteTrove).toHaveBeenCalledWith('mgmt1', 'the-secret')
    // No further reads/writes for this trove after deletion succeeds.
    expect(mockedGetManagementView).toHaveBeenCalledTimes(1)
    expect(mockedUpdateStandardTrove).not.toHaveBeenCalled()
  })

  it('shows an error and stays on the confirmation UI if delete fails (non-401)', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedDeleteTrove.mockRejectedValue(
      new ApiError('internal_error', 'An unexpected error occurred.', 500),
    )
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Yes, delete permanently' }),
    )

    await waitFor(() =>
      expect(
        screen.getByText('An unexpected error occurred.'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Yes, delete permanently' }),
    ).toBeInTheDocument()
  })

  it('collapses a 401 during delete to the generic invalid-link state', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    mockedDeleteTrove.mockRejectedValue(
      new ApiError('unauthorized', 'nope', 401),
    )
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    fireEvent.click(screen.getByRole('button', { name: 'Delete trove' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Yes, delete permanently' }),
    )

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
  })
})

describe('secret handling invariants', () => {
  it('never renders the management secret anywhere in the DOM', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    const { container } = renderAt('/m/mgmt1', '#super-secret-value')

    await screen.findByDisplayValue('My mirrors')
    expect(container.innerHTML).not.toContain('super-secret-value')
  })

  it('does not strip the fragment from the address bar', async () => {
    mockedGetManagementView.mockResolvedValue(view)
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByDisplayValue('My mirrors')
    expect(window.location.hash).toBe('#the-secret')
  })
})

describe('Private mode dispatch', () => {
  it('renders the Private management panel (never the Standard edit form) for a Private management view', async () => {
    mockedGetManagementView.mockResolvedValue({
      troveId: 'trove-1',
      mode: 'private',
      envelope: {
        v: 1,
        alg: 'AES-256-GCM',
        mode: 'plain',
        nonce: 'A'.repeat(16),
        ciphertext: 'A'.repeat(24),
      },
      expiresAt: null,
    })
    renderAt('/m/mgmt1', '#the-secret')

    await screen.findByLabelText('Current share link (or fragment)')
    // The Private panel's own "unlock to decrypt" gate, not the Standard
    // edit form (which would need no such capability prompt) and not the
    // Standard form's "Share link" reconstruction (a Private trove's
    // share link can't be rebuilt from the management view alone).
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.getByText(/public trove id/i)).toBeInTheDocument()
  })
})
