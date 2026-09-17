/**
 * Expiration codes and durations (docs/V0.1_SPEC.md §10, resolved). The
 * code is the canonical, agreed-upon value between client and server —
 * never the display label or a raw duration.
 */
export type ExpirationCode = '1h' | '1d' | '7d' | '30d' | '1y' | 'never'

export const EXPIRATION_CODES: readonly ExpirationCode[] = [
  '1h',
  '1d',
  '7d',
  '30d',
  '1y',
  'never',
]

/** `never` is a sentinel, not a duration (docs/V0.1_SPEC.md §10) — `null`. */
export const EXPIRATION_DURATION_SECONDS: Readonly<
  Record<ExpirationCode, number | null>
> = {
  '1h': 3_600,
  '1d': 86_400,
  '7d': 604_800,
  '30d': 2_592_000,
  '1y': 31_536_000,
  never: null,
}

export const DEFAULT_EXPIRATION_CODE: ExpirationCode = '7d'

export function isExpirationCode(value: unknown): value is ExpirationCode {
  return (
    typeof value === 'string' &&
    (EXPIRATION_CODES as readonly string[]).includes(value)
  )
}

/**
 * `1y` is a fixed 365-day duration, not calendar-year arithmetic
 * (docs/V0.1_SPEC.md §10) — this is why every code here is a plain
 * seconds-based offset from `from`, not `Date`-object year/month math.
 */
export function computeExpiresAt(
  code: ExpirationCode,
  from: Date,
): Date | null {
  const seconds = EXPIRATION_DURATION_SECONDS[code]
  if (seconds === null) {
    return null
  }
  return new Date(from.getTime() + seconds * 1000)
}

/** `never` (`expiresAt === null`) is never expired. */
export function isExpired(expiresAt: Date | null, now: Date): boolean {
  if (expiresAt === null) {
    return false
  }
  return expiresAt.getTime() <= now.getTime()
}
