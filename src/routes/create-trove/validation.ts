import type {
  ExpirationCode,
  ExpirationSelection,
  TroveFormValues,
} from './types'

/**
 * Client-side validation for the trove creation form.
 *
 * Every rule enforced here is traceable to docs/V0.1_SPEC.md §10 ("Deletion
 * and expiration") or §11 ("Expected validation"). Where the spec still
 * leaves something unresolved (e.g. concrete password-strength rules, or
 * the derived Private-Trove ciphertext byte ceiling), this module does not
 * invent a number; it only enforces what is actually documented.
 */

// V0.1_SPEC.md §11: "Link count: 1–25 links per trove, enforced both
// client- and server-side."
export const MIN_LINKS = 1
export const MAX_LINKS = 25

// V0.1_SPEC.md §11 "Field sizes (resolved for V0.1)".
export const MAX_TITLE_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 2000
export const MAX_LABEL_LENGTH = 120
export const MAX_URL_LENGTH = 8192
// V0.1_SPEC.md §11 (resolved): Standard access-gate password, 256 code
// points, server-enforced (docs/API_CONTRACT.md §3.1).
export const MAX_PASSWORD_LENGTH = 256

/**
 * V0.1_SPEC.md §10 "Expiration options (resolved for V0.1)". The code is
 * the canonical value; duration/seconds are deliberately not represented
 * here — the form only ever needs to store and submit the code.
 */
export const EXPIRATION_OPTIONS: ReadonlyArray<{
  code: ExpirationCode
  label: string
}> = [
  { code: '1h', label: '1 hour' },
  { code: '1d', label: '1 day' },
  { code: '7d', label: '7 days' },
  { code: '30d', label: '30 days' },
  { code: '1y', label: '1 year' },
  { code: 'never', label: 'Never' },
]

export const DEFAULT_EXPIRATION: ExpirationCode = '7d'

/**
 * Character-counting method (docs/V0.1_SPEC.md §11, resolved): Unicode
 * code points, not UTF-16 code units/`.length` — a character outside the
 * Basic Multilingual Plane (many emoji) counts as one character, matching
 * `src/server/domain/validation.ts`'s `codepointLength()` exactly, so a
 * value this client-side check accepts or rejects agrees with the
 * server's authoritative check at the boundary.
 */
export function codepointLength(value: string): number {
  return [...value].length
}

/**
 * V0.1_SPEC.md §11: "URL scheme: http:// and https:// only, checked
 * against the parsed (not merely string-prefixed) scheme... URL structure:
 * must parse as a valid absolute URL."
 */
export function isAllowedLinkUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

export function validateTitle(title: string): string | undefined {
  if (codepointLength(title.trim()) === 0) {
    return 'Enter a title.'
  }
  if (codepointLength(title) > MAX_TITLE_LENGTH) {
    return `Keep the title to ${MAX_TITLE_LENGTH} characters or fewer.`
  }
  return undefined
}

export function validateDescription(description: string): string | undefined {
  if (codepointLength(description) > MAX_DESCRIPTION_LENGTH) {
    return `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
  }
  return undefined
}

export function validateLinkUrl(url: string): string | undefined {
  const trimmed = url.trim()
  if (codepointLength(trimmed) === 0) {
    return 'Enter a URL.'
  }
  if (codepointLength(trimmed) > MAX_URL_LENGTH) {
    return `Keep the URL to ${MAX_URL_LENGTH} characters or fewer.`
  }
  if (!isAllowedLinkUrl(trimmed)) {
    return 'Enter a valid http:// or https:// URL.'
  }
  return undefined
}

export function validateLinkLabel(label: string): string | undefined {
  if (codepointLength(label) > MAX_LABEL_LENGTH) {
    return `Keep the label to ${MAX_LABEL_LENGTH} characters or fewer.`
  }
  return undefined
}

/**
 * Defensive check that the expiration is one of the closed set of codes
 * (V0.1_SPEC.md §10), or the edit-only `''` "keep current expiration"
 * sentinel (`ExpirationSelection`, always valid — it means "omit this
 * field from the PATCH," never a real value the server sees). The create
 * form never produces `''` (no UI offers it there), so this is a no-op
 * for creation; it only matters for the edit form.
 */
export function validateExpiration(
  expiration: ExpirationSelection,
): string | undefined {
  if (expiration === '') {
    return undefined
  }
  const isKnown = EXPIRATION_OPTIONS.some(
    (option) => option.code === expiration,
  )
  return isKnown ? undefined : 'Choose an expiration option.'
}

/**
 * V0.1_SPEC.md §3/§7/§11: an access-gate password for Standard Troves,
 * represented by the on/off + text field in this form. If enabled, a
 * non-empty value is required and capped at `MAX_PASSWORD_LENGTH` code
 * points — a genuine, server-enforced limit (unlike password *strength*,
 * which §11 leaves "advisory/UX-only, not a server-side gate" and this
 * module does not invent rules for).
 *
 * `allowUnchanged` is edit-mode-only: when the trove was already
 * password-protected when the editor loaded (`TroveForm`'s
 * `initialValues.passwordEnabled`), leaving the checkbox checked and the
 * field blank means "keep the existing password, whatever it is" — the
 * server never discloses it for this form to prefill (§8) — not "set an
 * empty password." The create form, and an edit that is newly enabling
 * protection, never pass this option, so a blank value is always an error
 * there.
 */
export function validatePassword(
  passwordEnabled: boolean,
  password: string,
  options: { allowUnchanged?: boolean } = {},
): string | undefined {
  if (!passwordEnabled) {
    return undefined
  }
  if (password.length === 0) {
    return options.allowUnchanged
      ? undefined
      : 'Enter a password, or turn off password protection.'
  }
  if (codepointLength(password) > MAX_PASSWORD_LENGTH) {
    return `Keep the password to ${MAX_PASSWORD_LENGTH} characters or fewer.`
  }
  return undefined
}

export interface LinkFieldErrors {
  url?: string
  label?: string
}

export interface TroveFormErrors {
  title?: string
  description?: string
  expiration?: string
  password?: string
  /** Keyed by LinkEntry.id. */
  links: Record<string, LinkFieldErrors>
}

export function validateForm(
  values: TroveFormValues,
  options: { allowUnchangedPassword?: boolean } = {},
): TroveFormErrors {
  const links: Record<string, LinkFieldErrors> = {}
  for (const link of values.links) {
    links[link.id] = {
      url: validateLinkUrl(link.url),
      label: validateLinkLabel(link.label),
    }
  }

  return {
    title: validateTitle(values.title),
    description: validateDescription(values.description),
    expiration: validateExpiration(values.expiration),
    password: validatePassword(values.passwordEnabled, values.password, {
      allowUnchanged: options.allowUnchangedPassword,
    }),
    links,
  }
}

export function formHasErrors(errors: TroveFormErrors): boolean {
  if (
    errors.title ||
    errors.description ||
    errors.expiration ||
    errors.password
  ) {
    return true
  }
  return Object.values(errors.links).some(
    (linkErrors) => Boolean(linkErrors.url) || Boolean(linkErrors.label),
  )
}
