import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createStandardTrove,
  getPublicTrove,
  getManagementView,
  updateStandardTrove,
  deleteTrove,
  unlockStandardTrove,
} from './standard-troves'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastCall() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!
  return { url, init: init!, headers: init!.headers as Record<string, string> }
}

describe('standard-troves API calls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('createStandardTrove posts the documented discriminated-union shape with password disabled', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(201, {
        troveId: 't1',
        managementId: 'm1',
        mode: 'standard',
        expiresAt: null,
      }),
    )
    await createStandardTrove(
      {
        title: 'Title',
        description: null,
        links: [{ url: 'https://example.com', label: null }],
        expiration: '7d',
        password: { enabled: false },
      },
      'my-secret',
    )
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/troves')
    expect(init.method).toBe('POST')
    expect(headers.Authorization).toBe('Bearer my-secret')
    expect(JSON.parse(init.body as string)).toEqual({
      mode: 'standard',
      title: 'Title',
      description: null,
      links: [{ url: 'https://example.com', label: null }],
      expiration: '7d',
      password: { enabled: false },
    })
  })

  it('createStandardTrove posts an enabled password with its value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(201, {
        troveId: 't1',
        managementId: 'm1',
        mode: 'standard',
        expiresAt: null,
      }),
    )
    await createStandardTrove(
      {
        title: 'Title',
        description: null,
        links: [{ url: 'https://example.com', label: null }],
        password: { enabled: true, value: 'hunter2' },
      },
      'my-secret',
    )
    const { init } = lastCall()
    expect(JSON.parse(init.body as string).password).toEqual({
      enabled: true,
      value: 'hunter2',
    })
  })

  it('getPublicTrove issues an unauthenticated GET to /api/v1/troves/:id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await getPublicTrove('t1')
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/troves/t1')
    expect(init.method).toBe('GET')
    expect(headers.Authorization).toBeUndefined()
  })

  it('getManagementView issues an authenticated GET to /api/v1/management/:managementId', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await getManagementView('m1', 'secret')
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/management/m1')
    expect(init.method).toBe('GET')
    expect(headers.Authorization).toBe('Bearer secret')
  })

  it('updateStandardTrove PATCHes only the provided partial fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await updateStandardTrove('m1', 'secret', { title: 'New title' })
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/management/m1')
    expect(init.method).toBe('PATCH')
    expect(headers.Authorization).toBe('Bearer secret')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New title' })
  })

  it('deleteTrove issues an authenticated DELETE and resolves undefined', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await deleteTrove('m1', 'secret')
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/management/m1')
    expect(init.method).toBe('DELETE')
    expect(headers.Authorization).toBe('Bearer secret')
    expect(result).toBeUndefined()
  })

  it('URL-encodes IDs used in path segments', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await getPublicTrove('weird/id with space')
    const { url } = lastCall()
    expect(url).toBe('/api/v1/troves/weird%2Fid%20with%20space')
  })

  it('unlockStandardTrove POSTs the password in the request body, unauthenticated, to /unlock', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        mode: 'standard',
        title: 'Unlocked',
        description: null,
        links: [],
        expiresAt: null,
        passwordProtected: true,
      }),
    )
    await unlockStandardTrove('t1', 'hunter2')
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/v1/troves/t1/unlock')
    expect(init.method).toBe('POST')
    expect(headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({ password: 'hunter2' })
  })

  it('unlockStandardTrove URL-encodes the trove ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await unlockStandardTrove('weird/id', 'hunter2')
    const { url } = lastCall()
    expect(url).toBe('/api/v1/troves/weird%2Fid/unlock')
  })

  it('unlockStandardTrove never puts the password in the URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await unlockStandardTrove('t1', 'my super secret password')
    const { url } = lastCall()
    expect(url).not.toContain('my')
    expect(url).not.toContain('secret')
    expect(url).not.toContain('password')
  })
})
