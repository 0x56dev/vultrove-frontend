import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CreateTrovePage } from './CreateTrovePage'
import { PublicTrovePage } from './PublicTrovePage'
import { ManagementPage } from './ManagementPage'

/**
 * Deliberately does **not** mock `../api/*` — every test here exercises
 * the real fetch call this app's data layer makes, with only
 * `globalThis.fetch` itself replaced, so these assertions are about the
 * actual bytes that would cross the network, not about what a mocked API
 * module was merely *told* to send. This is the "never appears in
 * request URLs/bodies/headers" verification the Stage 3 task requires
 * explicitly, for both the Private password and the fragment.
 */

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

function haystackOf(request: CapturedRequest): string {
  return `${request.url}\n${JSON.stringify(request.headers)}\n${request.body ?? ''}`
}

let captured: CapturedRequest[]

function installFetchMock(
  respond: (req: CapturedRequest) => { status: number; body: unknown },
) {
  captured = []
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input)
      const headers: Record<string, string> = {}
      const rawHeaders = (init?.headers ?? {}) as Record<string, string>
      for (const [key, value] of Object.entries(rawHeaders)) {
        headers[key] = value
      }
      const req: CapturedRequest = {
        url,
        method: init?.method ?? 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      }
      captured.push(req)
      // Submitting the create form also fires a best-effort
      // create_submit_clicked telemetry request (CreateTrovePage.tsx) —
      // this file deliberately doesn't mock ../api/*, so that real
      // request reaches this same fetch spy. Answer it directly rather
      // than routing it through each test's own `respond` callback,
      // which only knows about the trove create/view/manage shapes.
      if (url === '/api/v1/telemetry/events') {
        return new Response(null, { status: 204 })
      }
      const { status, body } = respond(req)
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    })
}

/** The trove create/view/manage request, excluding the incidental
 * create_submit_clicked telemetry request every create-form submit also
 * fires (see installFetchMock above). */
function capturedProductRequests(): CapturedRequest[] {
  return captured.filter((req) => req.url !== '/api/v1/telemetry/events')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sensitive data flow: Private trove creation', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  function fillMinimalPrivateForm() {
    fireEvent.click(screen.getByRole('radio', { name: /private/i }))
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Top secret title' },
    })
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/secret-resource' },
    })
  }

  it('never sends the plaintext title, the password, or the fragment in the create request', async () => {
    const fetchSpy = installFetchMock((req) => {
      const parsed = JSON.parse(req.body ?? '{}') as { troveId?: string }
      return {
        status: 201,
        body: {
          troveId: parsed.troveId,
          managementId: 'mgmt-xyz',
          mode: 'private',
          expiresAt: null,
        },
      }
    })

    render(
      <MemoryRouter initialEntries={['/create']}>
        <Routes>
          <Route path="/create" element={<CreateTrovePage />} />
        </Routes>
      </MemoryRouter>,
    )

    fillMinimalPrivateForm()
    fireEvent.click(
      screen.getByLabelText('Require a password to view this trove'),
    )
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'my-super-secret-encryption-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() =>
      expect(screen.getByText(/your trove is ready/i)).toBeInTheDocument(),
    )

    // Exactly one create request was made (no retry needed — the mocked
    // server never returns id_conflict) — plus one incidental
    // create_submit_clicked telemetry request (excluded below).
    const productRequests = capturedProductRequests()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(productRequests).toHaveLength(1)

    const shareUrl = screen.getByLabelText('Share link') as HTMLInputElement
    const fragment = shareUrl.value.split('#')[1]
    expect(fragment).toMatch(/^v1\./)

    const haystack = haystackOf(productRequests[0]!)
    expect(haystack).not.toContain('Top secret title')
    expect(haystack).not.toContain('my-super-secret-encryption-password')
    expect(haystack).not.toContain(fragment)

    // The create request's body is a discriminated-union Private shape
    // with an opaque envelope — never a plaintext content field.
    const body = JSON.parse(productRequests[0]!.body ?? '{}') as Record<
      string,
      unknown
    >
    expect(body.mode).toBe('private')
    expect(body).not.toHaveProperty('title')
    expect(body).not.toHaveProperty('password')
  })

  it('sends the management secret only via the Authorization header, never the body or URL', async () => {
    const fetchSpy = installFetchMock((req) => {
      const parsed = JSON.parse(req.body ?? '{}') as { troveId?: string }
      return {
        status: 201,
        body: {
          troveId: parsed.troveId,
          managementId: 'mgmt-xyz',
          mode: 'private',
          expiresAt: null,
        },
      }
    })

    render(
      <MemoryRouter initialEntries={['/create']}>
        <Routes>
          <Route path="/create" element={<CreateTrovePage />} />
        </Routes>
      </MemoryRouter>,
    )

    fillMinimalPrivateForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create trove' }))

    await waitFor(() =>
      expect(screen.getByText(/your trove is ready/i)).toBeInTheDocument(),
    )
    void fetchSpy

    const managementUrl = screen.getByLabelText(
      'Management link',
    ) as HTMLInputElement
    const managementSecret = managementUrl.value.split('#')[1]!
    expect(managementSecret.length).toBeGreaterThan(0)

    const req = capturedProductRequests()[0]!
    expect(req.headers.Authorization).toBe(`Bearer ${managementSecret}`)
    expect(req.url).not.toContain(managementSecret)
    expect(req.body ?? '').not.toContain(managementSecret)
  })
})

describe('sensitive data flow: Private trove viewing', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('the fragment never appears in the GET request, and no second request is made to check it', async () => {
    const { createPrivateEnvelope } = await import('../crypto/private-envelope')
    const { encodeFragment } = await import('../crypto/private-fragment')
    const { generateTroveId } = await import('../crypto/ids')

    const troveId = generateTroveId()
    const { envelope, fragmentSecret } = await createPrivateEnvelope(troveId, {
      schemaVersion: 1,
      title: 'Viewer test',
      description: null,
      links: [{ url: 'https://example.com/x', label: null }],
    })
    const fragment = encodeFragment(fragmentSecret)

    const fetchSpy = installFetchMock(() => ({
      status: 200,
      body: { mode: 'private', envelope, expiresAt: null },
    }))

    window.location.hash = `#${fragment}`
    render(
      <MemoryRouter initialEntries={[`/c/${troveId}`]}>
        <Routes>
          <Route path="/c/:troveId" element={<PublicTrovePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Viewer test' }),
      ).toBeInTheDocument(),
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const haystack = haystackOf(captured[0]!)
    expect(haystack).not.toContain(fragment)
    expect(captured[0]!.url).not.toContain('#')
  })
})

describe('sensitive data flow: Private management edit', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('never sends the decrypt fragment, the content password, or the plaintext content over the wire; the PATCH body only ever carries a fresh opaque envelope', async () => {
    const { createPrivateEnvelope } = await import('../crypto/private-envelope')
    const { encodeFragment } = await import('../crypto/private-fragment')
    const { generateTroveId } = await import('../crypto/ids')

    const troveId = generateTroveId()
    const managementSecret = 'the-management-secret'
    const { envelope, fragmentSecret } = await createPrivateEnvelope(
      troveId,
      {
        schemaVersion: 1,
        title: 'Original title',
        description: null,
        links: [{ url: 'https://example.com/x', label: null }],
      },
      'the-content-password',
    )
    const fragment = encodeFragment(fragmentSecret)

    let currentEnvelope = envelope
    const fetchSpy = installFetchMock((req) => {
      if (req.method === 'GET') {
        return {
          status: 200,
          body: {
            troveId,
            mode: 'private',
            envelope: currentEnvelope,
            expiresAt: null,
          },
        }
      }
      // PATCH
      const parsed = JSON.parse(req.body ?? '{}') as { envelope: unknown }
      currentEnvelope = parsed.envelope as typeof envelope
      return {
        status: 200,
        body: {
          troveId,
          mode: 'private',
          envelope: currentEnvelope,
          expiresAt: null,
        },
      }
    })

    window.location.hash = `#${managementSecret}`
    render(
      <MemoryRouter initialEntries={[`/m/mgmt-1`]}>
        <Routes>
          <Route path="/m/:managementId" element={<ManagementPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Management view loaded; now supply the decrypt capability.
    await screen.findByLabelText('Current share link (or fragment)')
    fireEvent.change(
      screen.getByLabelText('Current share link (or fragment)'),
      {
        target: { value: fragment },
      },
    )
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'the-content-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await screen.findByDisplayValue('Original title')

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New title after edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByText(/share link has changed/i)).toBeInTheDocument(),
    )

    const patchCall = captured.find((c) => c.method === 'PATCH')!
    const haystack = haystackOf(patchCall)
    expect(haystack).not.toContain('New title after edit')
    expect(haystack).not.toContain('the-content-password')
    expect(haystack).not.toContain(fragment)
    // Authorization on the PATCH is the management secret, never the
    // content password or fragment.
    expect(patchCall.headers.Authorization).toBe(`Bearer ${managementSecret}`)

    const patchBody = JSON.parse(patchCall.body ?? '{}') as {
      envelope: { ciphertext: string }
    }
    // Full rotation: the PATCH's envelope ciphertext differs from the
    // original (fresh key/nonce), and the new share link shown on
    // success is different from the one just used to unlock.
    expect(patchBody.envelope.ciphertext).not.toBe(envelope.ciphertext)

    const newShareLink = screen.getByLabelText(
      'New share link',
    ) as HTMLInputElement
    expect(newShareLink.value).not.toContain(fragment)

    void fetchSpy
  })
})
