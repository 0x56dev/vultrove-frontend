import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'

beforeEach(() => {
  // PublicTrovePage/ManagementPage read the management secret from the
  // real window.location.hash, independent of MemoryRouter's own
  // (separate, in-memory) history — reset it so no test leaks a hash
  // into the next one.
  window.location.hash = ''
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('routing', () => {
  it('renders the vultrove identity on the landing page', () => {
    renderAt('/')
    expect(
      screen.getByRole('heading', { level: 1, name: 'vultrove' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('one place for all your links.'),
    ).toBeInTheDocument()
  })

  it('navigates to /create when "Create a trove" is activated', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('link', { name: 'Create a trove' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create a trove' }),
    ).toBeInTheDocument()
  })

  it('routes /c/:troveId to the public trove page', () => {
    renderAt('/c/abc123')
    // Full fetch/loading/success behavior is covered by
    // PublicTrovePage.test.tsx — this only checks the route itself wires
    // to the right page.
    expect(screen.getByText(/loading trove/i)).toBeInTheDocument()
  })

  it('routes /m/:managementId to the management page', () => {
    // No fragment on this URL — ManagementPage fails locally without
    // calling the API (see ManagementPage.test.tsx for the full matrix).
    renderAt('/m/abc123')
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it('renders a dedicated 404 page for an unknown route', () => {
    renderAt('/this-route-does-not-exist')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
