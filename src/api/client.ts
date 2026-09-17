/**
 * Low-level HTTP client for Vultrove's own API.
 *
 * Every request path is relative (`/api/v1/...`) — never an absolute URL
 * with a hardcoded host — so the browser always calls the same origin the
 * page itself was loaded from. This is what keeps the frontend
 * same-origin-correct in local dev (via the Vite proxy, see
 * `vite.config.ts`), in production (reverse-proxied), and for any future
 * onion/i2p front door (docs/RUNTIME_ARCHITECTURE.md §5) — there is no
 * base-URL configuration to get wrong because there is no base URL at
 * all, by design.
 *
 * Error handling parses the documented `{ error: { code, message,
 * fields? } }` envelope (docs/API_CONTRACT.md §7) into a typed `ApiError`.
 * Only the fixed, documented `code`/`message`/`fields` fields are ever
 * surfaced — an unparseable body, a network failure, or a `message` this
 * client doesn't recognize the shape of all collapse to a fixed generic
 * message instead of being displayed verbatim, so this client can never
 * leak an arbitrary/unexpected server response body to the UI.
 */

export type ApiErrorCode =
  | 'malformed_request'
  | 'unauthorized'
  | 'not_found'
  | 'validation_failed'
  | 'payload_too_large'
  | 'unsupported_feature'
  | 'id_conflict'
  | 'rate_limited'
  | 'internal_error'
  /** Client-side only: the request never reached the server, or the
   * response body didn't match the documented error envelope at all. */
  | 'network_error'

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'malformed_request',
  'unauthorized',
  'not_found',
  'validation_failed',
  'payload_too_large',
  'unsupported_feature',
  'id_conflict',
  'rate_limited',
  'internal_error',
])

const GENERIC_MESSAGE =
  'Something went wrong talking to Vultrove. Please try again.'

// A request with no server-imposed limit of its own (a stalled proxy, a
// dropped connection that never sends a TCP RST, a backend that hangs
// mid-request) would otherwise leave `fetch()` pending forever — and
// every caller's "loading" UI state pending right along with it, with no
// way to ever leave that state. This bounds every request to a finite
// wait so a hang always surfaces as an ordinary `network_error`
// (indistinguishable from any other network failure, on purpose) rather
// than as permanent, silent loading.
const REQUEST_TIMEOUT_MS = 20_000

export class ApiError extends Error {
  readonly code: ApiErrorCode
  /** `null` when the request never produced an HTTP response at all
   * (e.g. offline/network failure). */
  readonly status: number | null
  readonly fields?: Record<string, string>

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null,
    fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiRequestOptions {
  method: HttpMethod
  path: string
  /** The raw management secret, if this call is authenticated
   * (docs/API_CONTRACT.md §2.4) — sent only via `Authorization: Bearer`,
   * never as a query parameter or in the body. */
  authorization?: string
  /** JSON-serializable request body. Omitted entirely (not even an empty
   * object) for requests with no body, so no `Content-Type` header is
   * sent for a bodyless `GET`/`DELETE`. */
  body?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeFields(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const result: Record<string, string> = {}
  for (const [key, fieldMessage] of Object.entries(value)) {
    if (typeof fieldMessage === 'string') {
      result[key] = fieldMessage
    }
  }
  return result
}

/**
 * Parses a non-2xx JSON body against the documented error envelope shape.
 * Anything that doesn't match — a missing `error.code`, an unrecognized
 * code, a non-JSON body — becomes a fixed `internal_error`/generic-message
 * `ApiError` rather than surfacing whatever the server (or an intervening
 * proxy) actually sent.
 */
function parseErrorEnvelope(body: unknown, status: number): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, fields } = body.error
    if (typeof code === 'string' && KNOWN_ERROR_CODES.has(code)) {
      const safeMessage =
        typeof message === 'string' ? message : GENERIC_MESSAGE
      return new ApiError(
        code as ApiErrorCode,
        safeMessage,
        status,
        sanitizeFields(fields),
      )
    }
  }
  return new ApiError('internal_error', GENERIC_MESSAGE, status)
}

export async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.authorization !== undefined) {
    headers.Authorization = `Bearer ${options.authorization}`
  }

  let response: Response
  try {
    response = await fetch(options.path, {
      method: options.method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // Network failure (offline, DNS, connection refused, CORS in a
    // misconfigured deployment, or the above timeout firing). Never
    // surface the raw fetch/abort error message — it can vary by browser
    // and is not one of the documented codes.
    throw new ApiError('network_error', GENERIC_MESSAGE, null)
  }

  // docs/API_CONTRACT.md §5.4: a successful DELETE is 204 with no body —
  // must not attempt to parse JSON from an intentionally empty response.
  if (response.status === 204) {
    return undefined as T
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw response.ok
      ? new ApiError('internal_error', GENERIC_MESSAGE, response.status)
      : parseErrorEnvelope(undefined, response.status)
  }

  if (!response.ok) {
    throw parseErrorEnvelope(json, response.status)
  }

  return json as T
}
