import { describe, it, expect } from 'vitest'
// Vite's `?raw` suffix imports the file's own source text — used only to
// assert this module never bakes in a literal hostname, not as an
// implementation dependency.
import urlsSource from './urls.ts?raw'
import { buildPublicTroveUrl, buildManagementUrl } from './urls'

describe('buildPublicTroveUrl', () => {
  it('builds /c/<troveId> under the given origin', () => {
    expect(
      buildPublicTroveUrl('abc123', 'https://vultrove-instance.example'),
    ).toBe('https://vultrove-instance.example/c/abc123')
  })

  it('uses whatever origin it is given, proving it is not hardcoded', () => {
    expect(buildPublicTroveUrl('abc123', 'http://localhost:5173')).toBe(
      'http://localhost:5173/c/abc123',
    )
    expect(buildPublicTroveUrl('abc123', 'http://vultrove-onion.onion')).toBe(
      'http://vultrove-onion.onion/c/abc123',
    )
  })

  it('URL-encodes the trove ID', () => {
    expect(buildPublicTroveUrl('a/b c', 'http://localhost')).toBe(
      'http://localhost/c/a%2Fb%20c',
    )
  })
})

describe('buildManagementUrl', () => {
  it('builds /m/<managementId>#<secret> under the given origin', () => {
    expect(
      buildManagementUrl(
        'mgmt123',
        'the-secret-value',
        'https://vultrove-instance.example',
      ),
    ).toBe('https://vultrove-instance.example/m/mgmt123#the-secret-value')
  })

  it('uses whatever origin it is given, proving it is not hardcoded', () => {
    expect(
      buildManagementUrl('mgmt123', 'secret', 'http://localhost:5173'),
    ).toBe('http://localhost:5173/m/mgmt123#secret')
  })

  it('places the secret after a literal "#", never as a query parameter', () => {
    const url = buildManagementUrl('mgmt123', 'secret', 'http://localhost')
    expect(url).toContain('#secret')
    expect(url).not.toContain('?')
    expect(url).not.toContain('secret=')
  })

  it('does not percent-encode the base64url secret (already fragment-safe)', () => {
    const secret = 'AbC-1_2xYz'
    const url = buildManagementUrl('mgmt123', secret, 'http://localhost')
    expect(url.endsWith(`#${secret}`)).toBe(true)
  })
})

describe('no hardcoded production host', () => {
  it('the module source never mentions vultrove.com or any literal hostname', () => {
    expect(urlsSource).not.toContain('vultrove.com')
    // The only origin these functions ever use is a parameter/window.location —
    // there should be no `https://` or `http://` literal baked into the code.
    const codeWithoutComments = urlsSource
      .split('\n')
      .filter(
        (line: string) =>
          !line.trim().startsWith('*') && !line.trim().startsWith('//'),
      )
      .join('\n')
    expect(codeWithoutComments).not.toMatch(/https?:\/\//)
  })
})
