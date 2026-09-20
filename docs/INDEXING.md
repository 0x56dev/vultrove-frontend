# Production indexing policy

This file defines the indexing boundary for the Vultrove frontend. It is not an
access-control policy. Authentication, unguessable identifiers, URL fragments,
Cloudflare Access, and the backend's existing authorization rules remain the
security boundary.

## Route policy

| Request class | Indexing policy | Sitemap |
| --- | --- | --- |
| `/` | `index, follow`; canonical `https://vultrove.com/` | Yes |
| `/create` | `index, follow`; canonical `https://vultrove.com/create` | Yes |
| `/privacy-telemetry` | `index, follow`; canonical `https://vultrove.com/privacy-telemetry` | Yes |
| `/c/:troveId` (every Standard or Private user-created trove) | `noindex, nofollow, noarchive, nosnippet` | Never |
| `/m/:managementId` (every management/control URL) | `noindex, nofollow, noarchive, nosnippet` | Never |
| Quick Drop resources and their management/control URLs | `noindex, nofollow, noarchive, nosnippet` | Never |
| Unknown document routes | `404` plus `noindex, nofollow, noarchive, nosnippet` | Never |
| `/api/*` | Preserve the API status and non-document Content-Type; add `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` | Never |

Quick Drop routes are not implemented or named anywhere in this repository.
Their actual backend route patterns must be inventoried in the private backend
and deployment repositories before this change is deployed. Do not add those
patterns to `robots.txt`: that would advertise them, and disallowing crawling
would also prevent a crawler from seeing a `noindex` response.

`public/robots.txt` therefore contains no private route names. It allows normal
crawling and points to the deliberately narrow sitemap. The noindex response is
the de-indexing control; robots.txt is not.

## Initial HTML and SPA behavior

The build emits four HTML shells:

- `index.html` for `/`;
- `_indexing/create.html` for `/create`;
- `_indexing/privacy-telemetry.html` for `/privacy-telemetry`;
- `_indexing/noindex.html` for trove, management, and 404 routes.

These are metadata-specific SPA shells, not prerendered page content. All use
the same React bundle. This gives crawlers and link unfurlers correct metadata
in the initial response without SSR, prerendering, or a framework migration.
The React `RouteMetadata` component maintains the same policy during client-side
navigation.

The web server must map exact public paths to the corresponding shell. It must
map the known dynamic document route families to `_indexing/noindex.html` with
status `200` and the noindex `X-Robots-Tag`. Unknown document routes should use
the same shell with status `404`, preserving the existing React 404 UI while
returning the correct HTTP status. The `_indexing` files should not be linked or
included in the sitemap; direct requests can be blocked at the proxy if desired.

The frontend repository cannot safely name or configure the missing Quick Drop
and other backend-only routes. Apply the same `X-Robots-Tag` to every such
resource and management/control route in the private production configuration.

Serve the crawler files with these response properties:

- `/robots.txt`: `200`, `Content-Type: text/plain; charset=utf-8`;
- `/sitemap.xml`: `200`, `Content-Type: application/xml` (or `text/xml`);
- no redirects or SPA fallback for either file.

## Staging

Keep the staging hostname behind its existing Cloudflare Access policy. An
unauthenticated request must be stopped by Access before reaching these static
files or app shells. Do not weaken that protection or rely on robots.txt or
noindex to make staging private.

## Deployment checklist

1. Build with `npm ci && npm run build` and deploy the complete `dist/` tree.
2. Before the generic SPA fallback, add exact mappings for `/`, `/create`,
   `/privacy-telemetry`, `/robots.txt`, and `/sitemap.xml` as described above.
3. Add the dynamic-route, API, Quick Drop, management/control, and 404
   `X-Robots-Tag` rules. Confirm fragments are never logged or sent to the
   server (normal browser behavior already excludes them).
4. Keep Cloudflare Access enabled for staging and test it unauthenticated.
5. Run the production HTTP checks in this file's route table, including one
   safely nonexistent representative for each dynamic family. Confirm no
   redirect loops and that every canonical returns `200` on the production
   origin.
6. Only after those checks pass, submit `https://vultrove.com/sitemap.xml` in
   Google Search Console and Bing Webmaster Tools. Request indexing for the
   three public canonical URLs if desired; do not submit dynamic/private URLs.
