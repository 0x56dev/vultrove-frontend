import { describe, it, expect } from 'vitest'
import { resolveDevApiTarget } from './vite.dev-proxy.ts'

describe('resolveDevApiTarget', () => {
  it('defaults to http://127.0.0.1:8080 when unset', () => {
    expect(resolveDevApiTarget({})).toBe('http://127.0.0.1:8080')
  })

  it('defaults when the variable is present but empty/whitespace', () => {
    expect(resolveDevApiTarget({ VULTROVE_DEV_API_TARGET: '' })).toBe(
      'http://127.0.0.1:8080',
    )
    expect(resolveDevApiTarget({ VULTROVE_DEV_API_TARGET: '   ' })).toBe(
      'http://127.0.0.1:8080',
    )
  })

  it('honors a valid http override', () => {
    expect(
      resolveDevApiTarget({ VULTROVE_DEV_API_TARGET: 'http://localhost:9090' }),
    ).toBe('http://localhost:9090')
  })

  it('honors a valid https override with a non-default host', () => {
    expect(
      resolveDevApiTarget({
        VULTROVE_DEV_API_TARGET: 'https://api.internal:8443',
      }),
    ).toBe('https://api.internal:8443')
  })

  it('normalizes a trailing slash away', () => {
    expect(
      resolveDevApiTarget({
        VULTROVE_DEV_API_TARGET: 'http://localhost:8080/',
      }),
    ).toBe('http://localhost:8080')
  })

  it('throws clearly on an unparseable URL', () => {
    expect(() =>
      resolveDevApiTarget({ VULTROVE_DEV_API_TARGET: 'not a url' }),
    ).toThrow(/valid absolute URL/)
  })

  it('throws clearly on a disallowed scheme', () => {
    expect(() =>
      resolveDevApiTarget({ VULTROVE_DEV_API_TARGET: 'ftp://localhost:21' }),
    ).toThrow(/http:\/\/ or https:\/\//)
  })

  it('throws clearly when a path is included', () => {
    expect(() =>
      resolveDevApiTarget({
        VULTROVE_DEV_API_TARGET: 'http://localhost:8080/api',
      }),
    ).toThrow(/no path/)
  })

  it('throws clearly when a query string is included', () => {
    expect(() =>
      resolveDevApiTarget({
        VULTROVE_DEV_API_TARGET: 'http://localhost:8080?x=1',
      }),
    ).toThrow(/query string/)
  })

  it('throws clearly when a fragment is included', () => {
    expect(() =>
      resolveDevApiTarget({
        VULTROVE_DEV_API_TARGET: 'http://localhost:8080#frag',
      }),
    ).toThrow(/fragment/)
  })

  it('does not read VITE_-prefixed variables as a substitute', () => {
    expect(
      resolveDevApiTarget({
        VITE_DEV_API_TARGET: 'http://should-not-be-used:1',
      }),
    ).toBe('http://127.0.0.1:8080')
  })
})
