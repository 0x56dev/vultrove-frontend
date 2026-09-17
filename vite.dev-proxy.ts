/**
 * Resolves the Vite dev server's `/api` proxy target
 * (docs/RUNTIME_ARCHITECTURE.md §5: production is same-origin via a
 * reverse proxy; this is the local-dev equivalent so the browser never
 * makes a cross-origin request to the Fastify process during
 * development).
 *
 * Deliberately a plain `Record<string, string | undefined>` parameter
 * (not read from `process.env` internally) so this is trivially
 * unit-testable without mutating real process environment state, and
 * deliberately its own module (not inlined in `vite.config.ts`) for the
 * same reason.
 *
 * The default target is `127.0.0.1`, not `localhost`: on a machine where
 * `localhost` resolves to the IPv6 loopback address (`::1`) ahead of the
 * IPv4 one (common on modern Linux `/etc/nsswitch.conf` + glibc
 * resolution order — observed on Arch Linux during local development)
 * while Fastify listens on `0.0.0.0` (IPv4-only, `src/server/config/env.ts`'s
 * `DEFAULT_HOST`), a `localhost` target lets the proxy's outbound
 * connection attempt the IPv6 loopback first and fail to reach the
 * server at all. `127.0.0.1` is unambiguous on every platform.
 *
 * `VULTROVE_DEV_API_TARGET` is intentionally **not** `VITE_`-prefixed:
 * a `VITE_`-prefixed variable is inlined into the browser-shipped bundle
 * by Vite's own convention, which would turn a dev-only proxy setting
 * into a runtime API-base-URL concept baked into frontend code — exactly
 * what this slice's architecture avoids (`src/api/client.ts` only ever
 * issues same-origin-relative requests; there is no frontend runtime
 * concept of "the API's base URL" to configure). This variable is read
 * only here, inside `vite.config.ts`'s own Node process, and never
 * reaches the browser.
 */

const DEFAULT_DEV_API_TARGET = 'http://127.0.0.1:8080'

export function resolveDevApiTarget(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.VULTROVE_DEV_API_TARGET

  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_DEV_API_TARGET
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(
      'VULTROVE_DEV_API_TARGET must be a valid absolute URL ' +
        `(e.g. "http://localhost:8080"); got ${JSON.stringify(raw)}.`,
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'VULTROVE_DEV_API_TARGET must use the http:// or https:// scheme; ' +
        `got ${JSON.stringify(raw)}.`,
    )
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      'VULTROVE_DEV_API_TARGET must be an origin only (scheme, host, ' +
        `port) with no path; got ${JSON.stringify(raw)}.`,
    )
  }

  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error(
      'VULTROVE_DEV_API_TARGET must not include a query string or ' +
        `fragment; got ${JSON.stringify(raw)}.`,
    )
  }

  // Normalized, trailing-slash-free origin, so Vite's
  // `target + incomingPath` proxy composition is unambiguous.
  return `${parsed.protocol}//${parsed.host}`
}
