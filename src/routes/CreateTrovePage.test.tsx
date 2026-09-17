import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CreateTrovePage } from './CreateTrovePage'
import { ApiError } from '../api/client'
import * as standardTroves from '../api/standard-troves'
import * as privateTroves from '../api/private-troves'

vi.mock('../api/standard-troves', () => ({
  createStandardTrove: vi.fn(),
}))

vi.mock('../api/private-troves', () => ({
  createPrivateTrove: vi.fn(),
}))

const mockedCreate = vi.mocked(standardTroves.createStandardTrove)
const mockedCreatePrivate = vi.mocked(privateTroves.createPrivateTrove)

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateTrovePage />
    </MemoryRouter>,
  )
}

function fillMinimalValidForm() {
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'My mirrors' },
  })
  fireEvent.change(screen.getByLabelText('Link 1 URL'), {
    target: { value: 'https://example.com/a' },
  })
}

beforeEach(() => {
  mockedCreate.mockReset()
  mockedCreatePrivate.mockReset()
})

describe('CreateTrovePage', () => {
  it('creates a trove with a client-generated management secret sent only as the Authorization argument, and shows both URLs on success', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 'trove-1',
      managementId: 'mgmt-1',
      mode: 'standard',
      expiresAt: '2026-06-08T00:00:00.000Z',
    })

    renderPage()
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1))
    const [input, secretArg] = mockedCreate.mock.calls[0]!
    expect(input).toMatchObject({ title: 'My mirrors' })
    expect(typeof secretArg).toBe('string')
    expect(secretArg.length).toBeGreaterThan(0)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /trove is ready/i }),
      ).toBeInTheDocument(),
    )
    const publicUrlField = screen.getByLabelText(
      'Share link',
    ) as HTMLInputElement
    const managementUrlField = screen.getByLabelText(
      'Management link',
    ) as HTMLInputElement
    expect(publicUrlField.value).toBe(`${window.location.origin}/c/trove-1`)
    expect(managementUrlField.value).toBe(
      `${window.location.origin}/m/mgmt-1#${secretArg}`,
    )
  })

  it('warns that the management link grants edit/delete authority and cannot be recovered', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 't1',
      managementId: 'm1',
      mode: 'standard',
      expiresAt: null,
    })
    renderPage()
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/edit or delete/i),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot recover/i)
  })

  it('shows a safe-to-display error and does not proceed to the success view on failure', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(
        'validation_failed',
        'The request violates a documented validation rule.',
        422,
      ),
    )

    renderPage()
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() =>
      expect(
        screen.getByText('The request violates a documented validation rule.'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('heading', { name: /trove is ready/i }),
    ).not.toBeInTheDocument()
  })

  it('sends description/label as null, not empty string, when left blank', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 't1',
      managementId: 'm1',
      mode: 'standard',
      expiresAt: null,
    })
    renderPage()
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const [input] = mockedCreate.mock.calls[0]!
    expect(input.description).toBeNull()
    expect(input.links[0]!.label).toBeNull()
  })

  it('sends password: {enabled: false} when password protection is left off', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 't1',
      managementId: 'm1',
      mode: 'standard',
      expiresAt: null,
    })
    renderPage()
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const [input] = mockedCreate.mock.calls[0]!
    expect(input.password).toEqual({ enabled: false })
  })

  it('sends the entered password as {enabled: true, value} when password protection is enabled', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 't1',
      managementId: 'm1',
      mode: 'standard',
      expiresAt: null,
    })
    renderPage()
    fillMinimalValidForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const [input] = mockedCreate.mock.calls[0]!
    expect(input.password).toEqual({ enabled: true, value: 'hunter2' })
  })

  it('never sends the plaintext password anywhere except as the password.value field', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 't1',
      managementId: 'm1',
      mode: 'standard',
      expiresAt: null,
    })
    renderPage()
    fillMinimalValidForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'my-super-secret-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const [input, secretArg] = mockedCreate.mock.calls[0]!
    expect(input.password).toEqual({
      enabled: true,
      value: 'my-super-secret-password',
    })
    // The management secret argument is a wholly separate, CSPRNG-generated
    // value — it must never be, or contain, the viewing password.
    expect(secretArg).not.toContain('my-super-secret-password')
  })

  it('returns to a clean, blank creation form when "Create another trove" is clicked, with no stale data/links/state carried over', async () => {
    mockedCreate.mockResolvedValue({
      troveId: 'trove-1',
      managementId: 'mgmt-1',
      mode: 'standard',
      expiresAt: null,
    })

    renderPage()
    fillMinimalValidForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /trove is ready/i }),
      ).toBeInTheDocument(),
    )
    const shareUrl = (screen.getByLabelText('Share link') as HTMLInputElement)
      .value
    const managementUrl = (
      screen.getByLabelText('Management link') as HTMLInputElement
    ).value

    fireEvent.click(
      screen.getByRole('button', { name: 'Create another trove' }),
    )

    // The success view (and the URLs/management secret it held) is gone —
    // this is the regression check for the button "appearing to do
    // nothing": before the fix, this heading/URLs stayed on screen
    // because the component never actually reset its state.
    expect(
      screen.queryByRole('heading', { name: /trove is ready/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(shareUrl)).not.toBeInTheDocument()
    expect(screen.queryByText(managementUrl)).not.toBeInTheDocument()

    // A genuinely fresh form: blank title/link, password toggle back off.
    expect(
      screen.getByRole('heading', { name: 'Create a trove' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.getByLabelText('Link 1 URL')).toHaveValue('')
    expect(
      screen.getByLabelText('Require a password to view this trove'),
    ).not.toBeChecked()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()

    // And it's a real, working form again, not a dead end.
    mockedCreate.mockResolvedValue({
      troveId: 'trove-2',
      managementId: 'mgmt-2',
      mode: 'standard',
      expiresAt: null,
    })
    fillMinimalValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2))
  })

  describe('Private trove creation without Web Crypto (e.g. an insecure-context LAN dev origin)', () => {
    let originalSubtle: SubtleCrypto

    beforeEach(() => {
      originalSubtle = crypto.subtle
      // Simulates a browser page loaded over plain http:// at a
      // non-localhost address (e.g. a phone hitting a LAN dev server) —
      // `crypto.subtle` is `undefined` there, `crypto.getRandomValues`
      // still works.
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

    it('fails before making any create API request, with a distinct, actionable message', async () => {
      renderPage()
      fireEvent.click(screen.getByRole('radio', { name: /private/i }))
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'My private trove' },
      })
      fireEvent.change(screen.getByLabelText(/url/i), {
        target: { value: 'https://example.com/secret' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/secure context/i),
      )
      expect(screen.getByRole('alert')).toHaveTextContent(/https/i)
      // The generic catch-all message must never be shown for this cause
      // — it's meant to be distinguishable from an unexplained failure.
      expect(
        screen.queryByText(/^something went wrong\.?$/i),
      ).not.toBeInTheDocument()

      // Never reaches the network layer at all.
      expect(mockedCreatePrivate).not.toHaveBeenCalled()
    })
  })
})
