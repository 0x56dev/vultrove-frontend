import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { defineConfig, configDefaults } from 'vitest/config'
import { resolveDevApiTarget } from './vite.dev-proxy.ts'
import {
  GENERIC_NOINDEX_SHELL_METADATA,
  NOINDEX_ROBOTS_DIRECTIVE,
  canonicalUrl,
  getRouteMetadata,
  type RouteMetadata,
} from './src/indexing/metadata.ts'

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

const ROUTE_METADATA_PATTERN =
  /<!-- vultrove-route-metadata:start -->[\s\S]*?<!-- vultrove-route-metadata:end -->/

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function routeMetadataMarkup(metadata: RouteMetadata): string {
  const canonical = canonicalUrl(metadata)
  const tags = ['<!-- vultrove-route-metadata:start -->']

  if (metadata.description) {
    tags.push(
      `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    )
  }
  tags.push(`<meta name="robots" content="${escapeHtml(metadata.robots)}" />`)
  if (canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`)
  }
  if (metadata.openGraph && metadata.description && canonical) {
    tags.push(
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="vultrove" />',
      `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    )
  }
  tags.push(
    `<title>${escapeHtml(metadata.title)}</title>`,
    '<!-- vultrove-route-metadata:end -->',
  )
  return tags.join('\n    ')
}

/**
 * Emits route-specific HTML shells, not rendered page content. They give the
 * two non-root public routes correct metadata in the initial response and
 * provide a noindex shell for all dynamic/private and 404 routes. The private
 * deployment config must map requests to these files; see docs/INDEXING.md.
 */
function indexingShellsPlugin(): Plugin {
  let outDir: string

  return {
    name: 'vultrove-indexing-shells',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(
          request.url ?? '/',
          'http://vultrove-preview.invalid',
        )
        const { pathname } = requestUrl

        if (pathname === '/robots.txt') {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          next()
          return
        }
        if (pathname === '/sitemap.xml') {
          response.setHeader('Content-Type', 'application/xml; charset=utf-8')
          next()
          return
        }
        if (pathname === '/create' || pathname === '/create/') {
          request.url = '/_indexing/create.html'
          next()
          return
        }
        if (
          pathname === '/privacy-telemetry' ||
          pathname === '/privacy-telemetry/'
        ) {
          request.url = '/_indexing/privacy-telemetry.html'
          next()
          return
        }
        if (/^\/(?:c|m)\/[^/]+\/?$/.test(pathname)) {
          request.url = '/_indexing/noindex.html'
          response.setHeader('X-Robots-Tag', NOINDEX_ROBOTS_DIRECTIVE)
          next()
          return
        }

        const isKnownStaticRequest =
          pathname === '/' ||
          pathname === '/favicon.svg' ||
          pathname.startsWith('/assets/') ||
          pathname.startsWith('/_indexing/') ||
          pathname.startsWith('/api/')
        if (isKnownStaticRequest) {
          next()
          return
        }

        response.statusCode = 404
        response.setHeader('X-Robots-Tag', NOINDEX_ROBOTS_DIRECTIVE)
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        void readFile(resolve(outDir, '_indexing/noindex.html'))
          .then((body) => response.end(body))
          .catch(next)
      })
    },
    async closeBundle() {
      const source = await readFile(resolve(outDir, 'index.html'), 'utf8')
      if (!ROUTE_METADATA_PATTERN.test(source)) {
        throw new Error(
          'The route metadata markers were not found in index.html',
        )
      }

      const shells = {
        '_indexing/create.html': getRouteMetadata('/create'),
        '_indexing/privacy-telemetry.html':
          getRouteMetadata('/privacy-telemetry'),
        '_indexing/noindex.html': GENERIC_NOINDEX_SHELL_METADATA,
      } as const

      await mkdir(resolve(outDir, '_indexing'), { recursive: true })
      await Promise.all(
        Object.entries(shells).map(([fileName, metadata]) =>
          writeFile(
            resolve(outDir, fileName),
            source.replace(
              ROUTE_METADATA_PATTERN,
              routeMetadataMarkup(metadata),
            ),
          ),
        ),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspMetaPlugin(), indexingShellsPlugin()],
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
