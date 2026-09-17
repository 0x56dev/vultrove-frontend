import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { defineConfig, configDefaults } from 'vitest/config'
import { resolveDevApiTarget } from './vite.dev-proxy.ts'

/**
 * Strict production CSP (Stage 3 task requirement), scoped to exactly
 * what this Vite/React app needs: same-origin scripts/styles/fonts/
 * images, no third-party origin anywhere. `wasm-unsafe-eval` is required
 * for hash-wasm's Argon2id (docs/PRIVATE_ENVELOPE.md §14): it decodes an
 * inline base64 WASM module and calls `WebAssembly.compile`/`instantiate`
 * on it, which CSP3 gates behind this specific token — not `unsafe-eval`,
 * and not something a network-fetch directive like `connect-src` covers,
 * since the module bytes are already local and never fetched.
 * `connect-src 'self'` covers this app's same-origin `/api/v1/...`
 * fetches; no analytics/CDN/font-service origin is ever contacted.
 *
 * Applied only to the production build (`vite build`), via a `<meta>` tag
 * injected into `index.html` at build time — **never** to `vite dev`: the
 * dev server injects its own inline React-Refresh bootstrap `<script>`
 * (verified directly against this project's dev server output) and a
 * `script-src` with no `'unsafe-inline'`/nonce would block it, breaking
 * Fast Refresh. This is the task's explicit "development and production
 * requirements may be handled separately" case, not a broad CSP weakening
 * — the strict policy still applies to every real deployment, and dev
 * tooling never gets network access it wouldn't already have.
 *
 * A `<meta http-equiv>` CSP cannot enforce `frame-ancestors` (browsers
 * only honor that directive from an HTTP response header); it's included
 * anyway as accurate policy intent for any reverse proxy that also sets
 * the equivalent `Content-Security-Policy` header, which this build does
 * not depend on.
 */
const PRODUCTION_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self'; " +
  "img-src 'self'; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'"

function cspMetaPlugin(): Plugin {
  return {
    name: 'vultrove-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      // `head-prepend` (Vite's documented tag-injection API, not a raw
      // string replace) so the policy is the first thing in <head> —
      // before any other tag — since a meta CSP only governs elements
      // parsed after it appears in the document.
      return [
        {
          tag: 'meta',
          injectTo: 'head-prepend' as const,
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: PRODUCTION_CSP,
          },
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspMetaPlugin()],
  server: {
    // Local-dev-only same-origin proxy (docs/RUNTIME_ARCHITECTURE.md §5) —
    // see vite.dev-proxy.ts for the target-resolution/validation logic and
    // why VULTROVE_DEV_API_TARGET is not a VITE_-prefixed variable.
    proxy: {
      '/api': {
        target: resolveDevApiTarget(),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [...configDefaults.exclude],
  },
})
