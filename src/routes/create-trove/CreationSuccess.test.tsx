import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CreationSuccess } from './CreationSuccess'

const PUBLIC_URL = 'http://localhost/c/trove-1'
const MANAGEMENT_URL = 'http://localhost/m/mgmt-1#the-secret'

function renderSuccess(onCreateAnother: () => void = vi.fn()) {
  return render(
    <MemoryRouter>
      <CreationSuccess
        troveId="trove-1"
        publicUrl={PUBLIC_URL}
        managementUrl={MANAGEMENT_URL}
        onCreateAnother={onCreateAnother}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('CreationSuccess', () => {
  it('displays both URLs in read-only fields', () => {
    renderSuccess()
    expect(screen.getByLabelText('Share link')).toHaveValue(PUBLIC_URL)
    expect(screen.getByLabelText('Management link')).toHaveValue(MANAGEMENT_URL)
    expect(screen.getByLabelText('Share link')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Management link')).toHaveAttribute('readonly')
  })

  it('copies the share link and announces success as visible text, not color/icon alone', async () => {
    renderSuccess()
    const [publicCopyButton] = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(publicCopyButton!)

    await waitFor(() =>
      expect(
        screen.getByText('Share link copied to clipboard.'),
      ).toBeInTheDocument(),
    )
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PUBLIC_URL)
  })

  it('copies the management link independently of the share link', async () => {
    renderSuccess()
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(copyButtons[1]!)

    await waitFor(() =>
      expect(
        screen.getByText('Management link copied to clipboard.'),
      ).toBeInTheDocument(),
    )
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MANAGEMENT_URL)
  })

  it('shows a manual-copy fallback message if the clipboard API fails', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    renderSuccess()
    const [publicCopyButton] = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(publicCopyButton!)

    await waitFor(() =>
      expect(screen.getByText(/copy it manually/i)).toBeInTheDocument(),
    )
  })

  it('focuses and fully selects the field when the clipboard write rejects, so the OS Copy action needs no manual selection', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    renderSuccess()
    const [publicCopyButton] = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(publicCopyButton!)

    const field = screen.getByLabelText('Share link') as HTMLInputElement
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(PUBLIC_URL.length)
  })

  it('falls back to selecting the field when the Clipboard API is unavailable entirely (no navigator.clipboard)', async () => {
    const navigatorWithoutClipboard = { ...navigator }
    // @ts-expect-error -- simulating an environment with no Clipboard API
    delete navigatorWithoutClipboard.clipboard
    vi.stubGlobal('navigator', navigatorWithoutClipboard)

    renderSuccess()
    const [publicCopyButton] = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(publicCopyButton!)

    const field = screen.getByLabelText('Share link') as HTMLInputElement
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(PUBLIC_URL.length)
    expect(screen.getByText(/copy it manually/i)).toBeInTheDocument()
  })

  it('does not touch the management field selection when only the share link copy fails', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    renderSuccess()
    const [publicCopyButton] = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(publicCopyButton!)

    await waitFor(() =>
      expect(screen.getByLabelText('Share link')).toHaveFocus(),
    )
    expect(screen.getByLabelText('Management link')).not.toHaveFocus()
  })

  it('warns that the management link grants edit/delete authority and cannot be recovered', () => {
    renderSuccess()
    expect(screen.getByRole('alert')).toHaveTextContent(
      /edit or delete this trove/i,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      /cannot recover this link/i,
    )
  })

  it('links to the public trove view using a relative internal path, not the absolute URL', () => {
    renderSuccess()
    expect(
      screen.getByRole('link', { name: 'View your trove' }),
    ).toHaveAttribute('href', '/c/trove-1')
  })

  it('calls onCreateAnother when "Create another trove" is clicked, instead of relying on a same-path Link navigation', () => {
    const onCreateAnother = vi.fn()
    renderSuccess(onCreateAnother)

    const button = screen.getByRole('button', { name: 'Create another trove' })
    // A same-path `<Link to="/create">` is a no-op navigation from this
    // page (its own route is already /create) and would leave this stale
    // success view mounted — this must be a real button, not a link.
    expect(button.tagName).toBe('BUTTON')
    fireEvent.click(button)

    expect(onCreateAnother).toHaveBeenCalledTimes(1)
  })

  it('never renders the management secret outside the intended management-link field', () => {
    const { container } = renderSuccess()
    const managementField = screen.getByLabelText('Management link')
    const rest = container.cloneNode(true) as HTMLElement
    rest.querySelector('#management-url')?.remove()
    expect(rest.innerHTML).not.toContain('the-secret')
    expect(managementField).toHaveValue(MANAGEMENT_URL)
  })
})
