export const PRODUCTION_ORIGIN = 'https://vultrove.com'

export const INDEX_ROBOTS_DIRECTIVE = 'index, follow'
export const NOINDEX_ROBOTS_DIRECTIVE =
  'noindex, nofollow, noarchive, nosnippet'

export interface RouteMetadata {
  title: string
  description?: string
  canonicalPath?: '/' | '/create' | '/privacy-telemetry'
  robots: typeof INDEX_ROBOTS_DIRECTIVE | typeof NOINDEX_ROBOTS_DIRECTIVE
  openGraph: boolean
}

export const PUBLIC_ROUTE_METADATA = {
  '/': {
    title: 'vultrove',
    description:
      'vultrove — bundle links into one shareable trove. No account required.',
    canonicalPath: '/',
    robots: INDEX_ROBOTS_DIRECTIVE,
    openGraph: true,
  },
  '/create': {
    title: 'Create a trove | vultrove',
    description:
      'Bundle links into a trove, choose an expiration, and get a share link plus a separate management link to edit or delete it later.',
    canonicalPath: '/create',
    robots: INDEX_ROBOTS_DIRECTIVE,
    openGraph: true,
  },
  '/privacy-telemetry': {
    title: 'Privacy-friendly telemetry | vultrove',
    description:
      'vultrove uses limited first-party aggregate telemetry to understand whether features are working and being used. This page explains exactly what that means.',
    canonicalPath: '/privacy-telemetry',
    robots: INDEX_ROBOTS_DIRECTIVE,
    openGraph: true,
  },
} as const satisfies Record<string, RouteMetadata>

const PRIVATE_ROUTE_METADATA: RouteMetadata = {
  title: 'Shared trove | vultrove',
  robots: NOINDEX_ROBOTS_DIRECTIVE,
  openGraph: false,
}

const MANAGEMENT_ROUTE_METADATA: RouteMetadata = {
  title: 'Manage trove | vultrove',
  robots: NOINDEX_ROBOTS_DIRECTIVE,
  openGraph: false,
}

const NOT_FOUND_ROUTE_METADATA: RouteMetadata = {
  title: 'Page not found | vultrove',
  robots: NOINDEX_ROBOTS_DIRECTIVE,
  openGraph: false,
}

// Document title for the generic noindex HTML shell only
// (_indexing/noindex.html), which the web server returns for /c/:id, /m/:id
// and unknown routes before React runs. It must stay neutral: the shell is
// shared by all of those, so it cannot know which one it is serving. React's
// RouteMetadata sets the route-specific title after hydration.
export const GENERIC_NOINDEX_SHELL_METADATA: RouteMetadata = {
  title: 'vultrove',
  robots: NOINDEX_ROBOTS_DIRECTIVE,
  openGraph: false,
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function getRouteMetadata(pathname: string): RouteMetadata {
  const normalized = normalizePathname(pathname)
  const publicMetadata =
    PUBLIC_ROUTE_METADATA[normalized as keyof typeof PUBLIC_ROUTE_METADATA]

  if (publicMetadata) {
    return publicMetadata
  }

  // Never put user-controlled IDs, management IDs, fragments, or query
  // parameters into metadata. These route families are intentionally absent
  // from the sitemap and must also receive an X-Robots-Tag at the web server.
  if (/^\/c\/[^/]+$/.test(normalized)) {
    return PRIVATE_ROUTE_METADATA
  }
  if (/^\/m\/[^/]+$/.test(normalized)) {
    return MANAGEMENT_ROUTE_METADATA
  }

  return NOT_FOUND_ROUTE_METADATA
}

export function canonicalUrl(metadata: RouteMetadata): string | undefined {
  if (metadata.canonicalPath === undefined) {
    return undefined
  }
  return `${PRODUCTION_ORIGIN}${metadata.canonicalPath}`
}
