import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendTelemetryEvent } from './telemetry'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastCall() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!
  return { url, init: init!, headers: init!.headers as Record<string, string> }
}

describe('telemetry API calls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('posts to /api/v1/telemetry/events with only the fixed event name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(204, undefined))

    await sendTelemetryEvent('create_submit_clicked')

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/telemetry/events')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({ event: 'create_submit_clicked' })
    // No management secret, no authorization at all for this endpoint.
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('does not swallow a failed request — rejects like any other apiRequest call', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network down'))

    await expect(
      sendTelemetryEvent('create_submit_clicked'),
    ).rejects.toBeInstanceOf(Error)
  })
})
