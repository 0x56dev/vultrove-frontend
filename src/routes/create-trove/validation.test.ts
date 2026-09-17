import { describe, expect, it } from 'vitest'
import type { ExpirationCode, TroveFormValues } from './types'
import {
  DEFAULT_EXPIRATION,
  EXPIRATION_OPTIONS,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LINKS,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  MIN_LINKS,
  codepointLength,
  formHasErrors,
  isAllowedLinkUrl,
  validateDescription,
  validateExpiration,
  validateForm,
  validateLinkLabel,
  validateLinkUrl,
  validatePassword,
  validateTitle,
} from './validation'

// U+1F600 GRINNING FACE — one Unicode code point, but a UTF-16 surrogate
// pair (`.length === 2`). Used throughout to prove length checks count
// code points, matching src/server/domain/validation.ts's
// codepointLength() exactly, not UTF-16 code units.
const ASTRAL_EMOJI = '\u{1F600}'

describe('codepointLength', () => {
  it('counts an astral character (surrogate pair) as one code point, not two', () => {
    expect(ASTRAL_EMOJI.length).toBe(2) // UTF-16 code units
    expect(codepointLength(ASTRAL_EMOJI)).toBe(1) // Unicode code points
  })
})

describe('Unicode-code-point validation boundaries (docs/V0.1_SPEC.md §11)', () => {
  it('accepts a title made entirely of astral characters exactly at the code-point limit', () => {
    const title = ASTRAL_EMOJI.repeat(MAX_TITLE_LENGTH)
    // A naive .length-based check would see this as 2x over the limit
    // and reject it; the server counts code points and would accept it.
    expect(title.length).toBe(MAX_TITLE_LENGTH * 2)
    expect(codepointLength(title)).toBe(MAX_TITLE_LENGTH)
    expect(validateTitle(title)).toBeUndefined()
  })

  it('rejects a title one code point over the limit even when astral', () => {
    const title = ASTRAL_EMOJI.repeat(MAX_TITLE_LENGTH + 1)
    expect(validateTitle(title)).toBeDefined()
  })

  it('accepts a description exactly at the astral code-point limit', () => {
    const description = ASTRAL_EMOJI.repeat(MAX_DESCRIPTION_LENGTH)
    expect(validateDescription(description)).toBeUndefined()
    expect(
      validateDescription(ASTRAL_EMOJI.repeat(MAX_DESCRIPTION_LENGTH + 1)),
    ).toBeDefined()
  })

  it('accepts a label exactly at the astral code-point limit', () => {
    const label = ASTRAL_EMOJI.repeat(MAX_LABEL_LENGTH)
    expect(validateLinkLabel(label)).toBeUndefined()
    expect(
      validateLinkLabel(ASTRAL_EMOJI.repeat(MAX_LABEL_LENGTH + 1)),
    ).toBeDefined()
  })
})

describe('isAllowedLinkUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isAllowedLinkUrl('http://example.com')).toBe(true)
    expect(isAllowedLinkUrl('https://example.com/path?query=1')).toBe(true)
  })

  it('rejects disallowed schemes', () => {
    expect(isAllowedLinkUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedLinkUrl('ftp://example.com')).toBe(false)
    expect(isAllowedLinkUrl('data:text/plain;base64,aGk=')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isAllowedLinkUrl('not a url')).toBe(false)
    expect(isAllowedLinkUrl('')).toBe(false)
    expect(isAllowedLinkUrl('example.com')).toBe(false)
  })
})

describe('validateTitle', () => {
  it('requires a non-empty title', () => {
    expect(validateTitle('')).toBeDefined()
    expect(validateTitle('   ')).toBeDefined()
    expect(validateTitle('My trove')).toBeUndefined()
  })

  it('enforces the 120-character limit (V0.1_SPEC.md §11) at the boundary', () => {
    expect(validateTitle('a'.repeat(MAX_TITLE_LENGTH))).toBeUndefined()
    expect(validateTitle('a'.repeat(MAX_TITLE_LENGTH + 1))).toBeDefined()
  })
})

describe('validateDescription', () => {
  it('is optional', () => {
    expect(validateDescription('')).toBeUndefined()
  })

  it('enforces the 2000-character limit at the boundary', () => {
    expect(
      validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH)),
    ).toBeUndefined()
    expect(
      validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH + 1)),
    ).toBeDefined()
  })
})

describe('validateLinkLabel', () => {
  it('is optional', () => {
    expect(validateLinkLabel('')).toBeUndefined()
  })

  it('enforces the 120-character limit at the boundary', () => {
    expect(validateLinkLabel('a'.repeat(MAX_LABEL_LENGTH))).toBeUndefined()
    expect(validateLinkLabel('a'.repeat(MAX_LABEL_LENGTH + 1))).toBeDefined()
  })
})

describe('validateLinkUrl', () => {
  it('requires a URL', () => {
    expect(validateLinkUrl('')).toBeDefined()
  })

  it('rejects non http/https schemes with a clear message', () => {
    expect(validateLinkUrl('javascript:alert(1)')).toBeDefined()
  })

  it('accepts a valid https URL', () => {
    expect(validateLinkUrl('https://example.com/file.zip')).toBeUndefined()
  })

  it('enforces the 8192-character limit at the boundary', () => {
    const longPath = 'a'.repeat(MAX_URL_LENGTH - 'https://example.com/'.length)
    const atLimit = `https://example.com/${longPath}`
    expect(atLimit.length).toBe(MAX_URL_LENGTH)
    expect(validateLinkUrl(atLimit)).toBeUndefined()
    expect(validateLinkUrl(`${atLimit}x`)).toBeDefined()
  })
})

describe('validateExpiration', () => {
  it('accepts every documented expiration code', () => {
    for (const option of EXPIRATION_OPTIONS) {
      expect(validateExpiration(option.code)).toBeUndefined()
    }
  })

  it('defines exactly the six codes documented in V0.1_SPEC.md §10', () => {
    expect(EXPIRATION_OPTIONS.map((option) => option.code)).toEqual([
      '1h',
      '1d',
      '7d',
      '30d',
      '1y',
      'never',
    ])
  })

  it('rejects a code outside the closed set', () => {
    expect(validateExpiration('45m' as ExpirationCode)).toBeDefined()
  })

  it('defaults to 7d', () => {
    expect(DEFAULT_EXPIRATION).toBe('7d')
  })
})

describe('validatePassword', () => {
  it('is fine when password protection is off, regardless of content', () => {
    expect(validatePassword(false, '')).toBeUndefined()
    expect(
      validatePassword(false, 'a'.repeat(MAX_PASSWORD_LENGTH + 1)),
    ).toBeUndefined()
  })

  it('requires a non-empty password when enabled', () => {
    expect(validatePassword(true, '')).toBeDefined()
    expect(validatePassword(true, 'hunter2')).toBeUndefined()
  })

  it('accepts a password at exactly the maximum length', () => {
    expect(
      validatePassword(true, 'a'.repeat(MAX_PASSWORD_LENGTH)),
    ).toBeUndefined()
  })

  it('rejects a password one code point over the maximum length', () => {
    expect(
      validatePassword(true, 'a'.repeat(MAX_PASSWORD_LENGTH + 1)),
    ).toBeDefined()
  })

  it('counts Unicode code points, not UTF-16 code units, for the maximum length', () => {
    const atLimit = ASTRAL_EMOJI.repeat(MAX_PASSWORD_LENGTH)
    expect(atLimit.length).toBe(MAX_PASSWORD_LENGTH * 2)
    expect(validatePassword(true, atLimit)).toBeUndefined()

    const overLimit = ASTRAL_EMOJI.repeat(MAX_PASSWORD_LENGTH + 1)
    expect(validatePassword(true, overLimit)).toBeDefined()
  })

  it('allowUnchanged: true treats a blank value as valid ("keep current password")', () => {
    expect(validatePassword(true, '', { allowUnchanged: true })).toBeUndefined()
  })

  it('allowUnchanged: true still enforces the maximum length on a non-blank value', () => {
    expect(
      validatePassword(true, 'a'.repeat(MAX_PASSWORD_LENGTH + 1), {
        allowUnchanged: true,
      }),
    ).toBeDefined()
  })

  it('allowUnchanged: false (default) still requires a non-empty password when enabled', () => {
    expect(validatePassword(true, '', { allowUnchanged: false })).toBeDefined()
  })
})

function makeValues(overrides: Partial<TroveFormValues> = {}): TroveFormValues {
  return {
    mode: 'standard',
    title: 'A title',
    description: '',
    links: [{ id: 'link-0', url: 'https://example.com', label: '' }],
    expiration: DEFAULT_EXPIRATION,
    passwordEnabled: false,
    password: '',
    ...overrides,
  }
}

describe('validateForm / formHasErrors', () => {
  it('reports no errors for a minimally valid Standard trove', () => {
    const errors = validateForm(makeValues())
    expect(formHasErrors(errors)).toBe(false)
  })

  it('reports a title error when the title is empty', () => {
    const errors = validateForm(makeValues({ title: '' }))
    expect(errors.title).toBeDefined()
    expect(formHasErrors(errors)).toBe(true)
  })

  it('reports a per-link URL error keyed by link id', () => {
    const errors = validateForm(
      makeValues({
        links: [{ id: 'link-0', url: 'not a url', label: '' }],
      }),
    )
    expect(errors.links['link-0']?.url).toBeDefined()
    expect(formHasErrors(errors)).toBe(true)
  })

  it('reports a per-link label error keyed by link id', () => {
    const errors = validateForm(
      makeValues({
        links: [
          {
            id: 'link-0',
            url: 'https://example.com',
            label: 'a'.repeat(MAX_LABEL_LENGTH + 1),
          },
        ],
      }),
    )
    expect(errors.links['link-0']?.label).toBeDefined()
    expect(formHasErrors(errors)).toBe(true)
  })

  it('reports a description error when it exceeds the limit', () => {
    const errors = validateForm(
      makeValues({ description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1) }),
    )
    expect(errors.description).toBeDefined()
    expect(formHasErrors(errors)).toBe(true)
  })

  it('reports a password error only when password protection is enabled', () => {
    const withoutPassword = validateForm(
      makeValues({ passwordEnabled: false, password: '' }),
    )
    expect(formHasErrors(withoutPassword)).toBe(false)

    const withPassword = validateForm(
      makeValues({ passwordEnabled: true, password: '' }),
    )
    expect(withPassword.password).toBeDefined()
    expect(formHasErrors(withPassword)).toBe(true)
  })

  it('allowUnchangedPassword lets a blank value through while protection stays enabled', () => {
    const errors = validateForm(
      makeValues({ passwordEnabled: true, password: '' }),
      { allowUnchangedPassword: true },
    )
    expect(errors.password).toBeUndefined()
    expect(formHasErrors(errors)).toBe(false)
  })

  it('is valid for every documented expiration code', () => {
    for (const option of EXPIRATION_OPTIONS) {
      const errors = validateForm(makeValues({ expiration: option.code }))
      expect(formHasErrors(errors)).toBe(false)
    }
  })
})

describe('link count bounds', () => {
  it('are set to the documented 1-25 range (V0.1_SPEC.md §11)', () => {
    expect(MIN_LINKS).toBe(1)
    expect(MAX_LINKS).toBe(25)
  })
})
