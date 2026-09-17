import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiRequest, ApiError } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('resolves with the parsed JSON body on a 2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { title: 'hello' }),
    )
    const result = await apiRequest<{ title: string }>({
      method: 'GET',
      path: '/api/v1/troves/abc',
    })
    expect(result).toEqual({ title: 'hello' })
  })

  it('resolves undefined for a 204 response without attempting to parse a body', async () => {
    const res = new Response(null, { status: 204 })
    vi.mocked(fetch).mockResolvedValueOnce(res)
    const result = await apiRequest<void>({
      method: 'DELETE',
      path: '/api/v1/management/abc',
      authorization: 'secret',
    })
    expect(result).toBeUndefined()
  })

  it('sends Authorization: Bearer <secret> only when authorization is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await apiRequest({
      method: 'GET',
      path: '/api/v1/management/abc',
      authorization: 'the-secret',
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer the-secret')
  })

  it('omits Authorization and Content-Type on an unauthenticated, bodyless GET', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('sends Content-Type: application/json and a JSON body when body is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, {}))
    await apiRequest({
      method: 'POST',
      path: '/api/v1/troves',
      body: { mode: 'standard' },
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = init!.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(init!.body).toBe(JSON.stringify({ mode: 'standard' }))
  })

  it('uses the exact relative path given, never an absolute URL with a host', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    await apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/v1/troves/abc')
  })

  it('parses a documented error envelope into a matching ApiError', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(422, {
        error: {
          code: 'validation_failed',
          message: 'The request violates a documented validation rule.',
          fields: { title: 'Title is required.' },
        },
      }),
    )
    await expect(
      apiRequest({ method: 'POST', path: '/api/v1/troves', body: {} }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      status: 422,
      message: 'The request violates a documented validation rule.',
      fields: { title: 'Title is required.' },
    })
  })

  it('collapses an unrecognized error code to a fixed internal_error, not the raw code/message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(400, {
        error: { code: 'some_future_code', message: 'raw server detail' },
      }),
    )
    let caught: unknown
    try {
      await apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    const apiErr = caught as ApiError
    expect(apiErr.code).toBe('internal_error')
    expect(apiErr.message).not.toContain('raw server detail')
  })

  it('collapses a non-JSON error body to a fixed internal_error rather than throwing a parse error', async () => {
    const res = new Response('not json at all', { status: 500 })
    vi.mocked(fetch).mockResolvedValueOnce(res)
    let caught: unknown
    try {
      await apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe('internal_error')
    expect((caught as ApiError).message).not.toContain('not json at all')
  })

  it('wraps a network failure as network_error with a null status, not the raw fetch error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    let caught: unknown
    try {
      await apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    const apiErr = caught as ApiError
    expect(apiErr.code).toBe('network_error')
    expect(apiErr.status).toBeNull()
    expect(apiErr.message).not.toContain('Failed to fetch')
  })

  it('bounds every request to a finite wait via AbortSignal.timeout, converting a request that never settles into a network_error instead of hanging forever', async () => {
    const controller = new AbortController()
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal)
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          // A stalled connection: the mocked fetch never itself
          // resolves/rejects — the only way this promise ever settles is
          // via the signal apiRequest is required to pass through.
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    const promise = apiRequest({ method: 'GET', path: '/api/v1/troves/abc' })
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Number))
    expect(timeoutSpy.mock.calls[0]![0]).toBeGreaterThan(0)

    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'network_error',
      status: null,
    })
  })

  it('drops non-string entries from error.fields rather than passing them through', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(422, {
        error: {
          code: 'validation_failed',
          message: 'x',
          fields: { title: 'ok', weird: 42, nested: { a: 1 } },
        },
      }),
    )
    await expect(
      apiRequest({ method: 'GET', path: '/api/v1/troves/abc' }),
    ).rejects.toMatchObject({ fields: { title: 'ok' } })
  })
})
