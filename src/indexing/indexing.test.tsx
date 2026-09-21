import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import robots from '../../public/robots.txt?raw'
import sitemap from '../../public/sitemap.xml?raw'
import initialHtml from '../../index.html?raw'
import { RouteMetadata } from './RouteMetadata'
import {
  GENERIC_NOINDEX_SHELL_METADATA,
  INDEX_ROBOTS_DIRECTIVE,
  NOINDEX_ROBOTS_DIRECTIVE,
  PUBLIC_ROUTE_METADATA,
  canonicalUrl,
  getRouteMetadata,
} from './metadata'

beforeEach(() => {
  document.title = ''
  document.head
    .querySelectorAll(
      'meta[name="description"], meta[name="robots"], meta[property^="og:"], link[rel="canonical"]',
    )
    .forEach((element) => element.remove())
})

function renderMetadata(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteMetadata />
    </MemoryRouter>,
  )
}

describe('indexing policy', () => {
  it.each(['/', '/create', '/privacy-telemetry'])(
    'makes %s indexable with a production canonical',
    async (path) => {
      renderMetadata(path)

      await waitFor(() => {
        expect(
          document.head.querySelector('meta[name="robots"]'),
        ).toHaveAttribute('content', INDEX_ROBOTS_DIRECTIVE)
      })
      expect(
        document.head.querySelector('meta[name="description"]'),
      ).toHaveAttribute(
        'content',
        PUBLIC_ROUTE_METADATA[path as keyof typeof PUBLIC_ROUTE_METADATA]
          .description,
      )
      expect(
        document.head.querySelector('link[rel="canonical"]'),
      ).toHaveAttribute('href', canonicalUrl(getRouteMetadata(path)))
      expect(
        document.head.querySelector('meta[property="og:url"]'),
      ).toHaveAttribute('content', canonicalUrl(getRouteMetadata(path)))
    },
  )

  it.each([
    '/c/user-created-trove',
    '/c/user-created-trove?source=shared',
    '/m/management-id#secret',
    '/quick-drop/example',
    '/unknown',
  ])('makes %s noindex without canonical or social metadata', async (path) => {
    renderMetadata(path)

    await waitFor(() => {
      expect(
        document.head.querySelector('meta[name="robots"]'),
      ).toHaveAttribute('content', NOINDEX_ROBOTS_DIRECTIVE)
    })
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[property^="og:"]')).toBeNull()
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
  })

  it('gives the generic noindex shell a neutral title, not a not-found title', () => {
    expect(GENERIC_NOINDEX_SHELL_METADATA.title).toBe('vultrove')
    expect(GENERIC_NOINDEX_SHELL_METADATA.robots).toBe(NOINDEX_ROBOTS_DIRECTIVE)
    expect(GENERIC_NOINDEX_SHELL_METADATA.description).toBeUndefined()
    expect(GENERIC_NOINDEX_SHELL_METADATA.canonicalPath).toBeUndefined()
    // The client-side not-found route keeps its own title after hydration.
    expect(getRouteMetadata('/unknown').title).toBe('Page not found | vultrove')
  })

  it('keeps user-controlled route values out of metadata', () => {
    const marker = 'secret-bearing-id'
    const metadata = getRouteMetadata(`/m/${marker}`)
    expect(JSON.stringify(metadata)).not.toContain(marker)
  })
})

describe('crawler files', () => {
  it('publishes a minimal robots file without advertising private route names', () => {
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Sitemap: https://vultrove.com/sitemap.xml')
    expect(robots).not.toMatch(/\/c\/|\/m\/|api|quick.?drop/i)
  })

  it('lists only canonical public routes in the sitemap', () => {
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    )
    expect(locations).toEqual([
      'https://vultrove.com/',
      'https://vultrove.com/create',
      'https://vultrove.com/privacy-telemetry',
    ])
    expect(sitemap).not.toMatch(/staging|\/api\/|\/c\/|\/m\/|quick.?drop/i)
  })

  it('puts production metadata in the initial root HTML response', () => {
    expect(initialHtml).toContain('<meta name="robots" content="index, follow"')
    expect(initialHtml).toContain(
      '<link rel="canonical" href="https://vultrove.com/"',
    )
    expect(initialHtml).toContain(
      '<meta property="og:url" content="https://vultrove.com/"',
    )
  })
})
