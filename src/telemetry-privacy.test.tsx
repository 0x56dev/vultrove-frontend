import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { App } from './App'

/**
 * Structural privacy check for the telemetry feature (task requirement):
 * no cookie, no localStorage/sessionStorage write, and no generated
 * visitor identifier as a side effect of either rendering the app (footer
 * + FAQ page included) or actually submitting the Create Trove form,
 * which is the one place this app calls the telemetry endpoint.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  window.location.hash = ''
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(204, undefined)),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('telemetry introduces no persistent client-side identity', () => {
  it('never sets a cookie and never writes to localStorage/sessionStorage while rendering the app, the footer, or the FAQ page', () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    const cookieSetSpy = vi.spyOn(document, 'cookie', 'set')

    render(
      <MemoryRouter initialEntries={['/privacy-telemetry']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Privacy-friendly telemetry' }),
    ).toBeInTheDocument()

    expect(localSetSpy).not.toHaveBeenCalled()
    expect(cookieSetSpy).not.toHaveBeenCalled()
  })

  it('never sets a cookie and never writes to localStorage/sessionStorage when the create_submit_clicked telemetry call fires', async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    const cookieSetSpy = vi.spyOn(document, 'cookie', 'set')

    render(
      <MemoryRouter initialEntries={['/create']}>
        <App />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'My mirrors' },
    })
    fireEvent.change(screen.getByLabelText('Link 1 URL'), {
      target: { value: 'https://example.com/a' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())

    expect(localSetSpy).not.toHaveBeenCalled()
    expect(cookieSetSpy).not.toHaveBeenCalled()
  })
})
