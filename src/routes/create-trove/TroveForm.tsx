import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { LinkRow } from './LinkRow'
import type { LinkEntry, TroveFormValues, TroveMode } from './types'
import {
  EXPIRATION_OPTIONS,
  MAX_DESCRIPTION_LENGTH,
  MAX_LINKS,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_LINKS,
  formHasErrors,
  validateForm,
} from './validation'
import styles from './TroveForm.module.css'

function formatExpiresAt(expiresAt: Date | null): string {
  if (expiresAt === null) {
    return 'never'
  }
  return expiresAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export interface TroveFormProps {
  /**
   * `'create'` renders the "Trove type" mode picker and always starts
   * from a real expiration code (defaulting to `7d`). `'edit'` omits the
   * mode picker entirely (mode cannot change after creation,
   * docs/API_CONTRACT.md §5.3 — this slice only ever edits Standard
   * Troves anyway) and adds a "keep current expiration" option so an
   * edit that doesn't touch expiration doesn't accidentally change it.
   */
  formMode: 'create' | 'edit'
  initialValues: TroveFormValues
  /** The trove's current absolute expiry, shown next to "keep current"
   * in edit mode. Ignored in create mode. */
  currentExpiresAt?: Date | null
  onSubmit: (values: TroveFormValues) => void | Promise<void>
  submitLabel: string
  submitting?: boolean
  /** A safe-to-display message from a failed submission (already parsed
   * from `ApiError` by the caller) — never an internal/raw error. */
  submitError?: string | null
}

/**
 * Trove creation/edit form. Local field validation and layout only — it
 * never calls the network API itself; `onSubmit` is provided by the
 * caller (`CreateTrovePage`/`ManagementPage`), which owns request
 * lifecycle (loading/error) and knows whether this is a create or an
 * update.
 *
 * Both Standard and Private Troves are implemented. The "Password
 * protection" fieldset below is shared by both modes but means something
 * different in each: for Standard, it's a server-checked access gate
 * (docs/API_CONTRACT.md §3.1); for Private, it's local input to the
 * client-side encryption (docs/PRIVATE_ENVELOPE.md §12) — the password is
 * never sent to the server in that case. `values.mode` selects the hint
 * text shown, never the underlying form field itself.
 */
export function TroveForm({
  formMode,
  initialValues,
  currentExpiresAt = null,
  onSubmit,
  submitLabel,
  submitting = false,
  submitError = null,
}: TroveFormProps) {
  const nextLinkNumber = useRef(initialValues.links.length)
  const [values, setValues] = useState<TroveFormValues>(initialValues)
  const [touchedTitle, setTouchedTitle] = useState(false)
  const [touchedDescription, setTouchedDescription] = useState(false)
  const [touchedPassword, setTouchedPassword] = useState(false)
  const [touchedLinkUrlIds, setTouchedLinkUrlIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [touchedLinkLabelIds, setTouchedLinkLabelIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // Fixed for this component instance (a remount, via TroveForm's `key`
  // prop in ManagementPage, is how the caller signals a genuinely
  // different trove) — not re-derived from the live `values.passwordEnabled`
  // toggle, which the user may flip during editing.
  const passwordProtectedInitially = initialValues.passwordEnabled
  // Private mode has no server-side "leave blank to keep the existing
  // password" concept — every edit fully re-derives the KEK from an
  // actual password string (docs/PRIVATE_ENVELOPE.md §17), so the caller
  // (ManagementPage's Private flow) always prefills this field with the
  // real current password rather than leaving it blank, and a blank
  // submission here is a genuine validation error, not a "keep current"
  // sentinel — only Standard's server-checked access gate has that
  // affordance.
  const allowUnchangedPassword =
    formMode === 'edit' &&
    passwordProtectedInitially &&
    initialValues.mode !== 'private'

  const errors = validateForm(values, { allowUnchangedPassword })

  function updateValues(updater: (prev: TroveFormValues) => TroveFormValues) {
    setValues(updater)
  }

  function handleModeChange(mode: TroveMode) {
    updateValues((prev) => ({ ...prev, mode }))
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    const title = event.target.value
    updateValues((prev) => ({ ...prev, title }))
  }

  function handleDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const description = event.target.value
    updateValues((prev) => ({ ...prev, description }))
  }

  function handleExpirationChange(event: ChangeEvent<HTMLSelectElement>) {
    // The <select> only ever offers the closed set of EXPIRATION_OPTIONS
    // codes (plus, in edit mode, the '' "keep current" sentinel), so this
    // cast reflects exactly what the control can actually produce.
    const expiration = event.target.value as TroveFormValues['expiration']
    updateValues((prev) => ({ ...prev, expiration }))
  }

  function handlePasswordToggle(event: ChangeEvent<HTMLInputElement>) {
    const passwordEnabled = event.target.checked
    updateValues((prev) => ({ ...prev, passwordEnabled }))
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const password = event.target.value
    updateValues((prev) => ({ ...prev, password }))
  }

  function handleLinkUrlChange(id: string, url: string) {
    updateValues((prev) => ({
      ...prev,
      links: prev.links.map((link) =>
        link.id === id ? { ...link, url } : link,
      ),
    }))
  }

  function handleLinkLabelChange(id: string, label: string) {
    updateValues((prev) => ({
      ...prev,
      links: prev.links.map((link) =>
        link.id === id ? { ...link, label } : link,
      ),
    }))
  }

  function handleLinkUrlBlur(id: string) {
    setTouchedLinkUrlIds((prev) => new Set(prev).add(id))
  }

  function handleLinkLabelBlur(id: string) {
    setTouchedLinkLabelIds((prev) => new Set(prev).add(id))
  }

  function handleAddLink() {
    if (values.links.length >= MAX_LINKS) {
      return
    }
    const id = `link-${nextLinkNumber.current}`
    nextLinkNumber.current += 1
    const newLink: LinkEntry = { id, url: '', label: '' }
    updateValues((prev) => ({ ...prev, links: [...prev.links, newLink] }))
  }

  function handleRemoveLink(id: string) {
    if (values.links.length <= MIN_LINKS) {
      return
    }
    updateValues((prev) => ({
      ...prev,
      links: prev.links.filter((link) => link.id !== id),
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setTouchedTitle(true)
    setTouchedDescription(true)
    setTouchedPassword(true)
    setTouchedLinkUrlIds(new Set(values.links.map((link) => link.id)))
    setTouchedLinkLabelIds(new Set(values.links.map((link) => link.id)))

    if (formHasErrors(errors) || submitting) {
      return
    }

    void onSubmit(values)
  }

  const showTitleError = touchedTitle && Boolean(errors.title)
  const showDescriptionError = touchedDescription && Boolean(errors.description)
  const showPasswordError = touchedPassword && Boolean(errors.password)
  const linkCountAtMax = values.links.length >= MAX_LINKS
  const linkCountAtMin = values.links.length <= MIN_LINKS

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formMode === 'create' ? (
        <fieldset className={styles.fieldset}>
          <legend>Trove type</legend>
          <div className={styles.modeOptions}>
            <label className={styles.modeOption}>
              <input
                type="radio"
                name="mode"
                value="standard"
                checked={values.mode === 'standard'}
                onChange={() => handleModeChange('standard')}
              />
              <span>
                <span className={styles.modeOptionTitle}>Standard</span>
                <span className={styles.modeOptionHint}>
                  Server-readable. Eligible for moderation and aggregate
                  analytics.
                </span>
              </span>
            </label>
            <label className={styles.modeOption}>
              <input
                type="radio"
                name="mode"
                value="private"
                checked={values.mode === 'private'}
                onChange={() => handleModeChange('private')}
              />
              <span>
                <span className={styles.modeOptionTitle}>Private</span>
                <span className={styles.modeOptionHint}>
                  Encrypted in your browser before it's sent. The server never
                  sees the plaintext.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="trove-title">Title</label>
        <input
          id="trove-title"
          type="text"
          maxLength={MAX_TITLE_LENGTH}
          value={values.title}
          onChange={handleTitleChange}
          onBlur={() => setTouchedTitle(true)}
          aria-invalid={showTitleError ? 'true' : undefined}
          aria-describedby={showTitleError ? 'trove-title-error' : undefined}
        />
        {showTitleError ? (
          <p className={styles.fieldError} id="trove-title-error">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="trove-description">Description (optional)</label>
        <textarea
          id="trove-description"
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={values.description}
          onChange={handleDescriptionChange}
          onBlur={() => setTouchedDescription(true)}
          aria-invalid={showDescriptionError ? 'true' : undefined}
          aria-describedby={
            showDescriptionError ? 'trove-description-error' : undefined
          }
        />
        {showDescriptionError ? (
          <p className={styles.fieldError} id="trove-description-error">
            {errors.description}
          </p>
        ) : null}
      </div>

      <fieldset className={styles.fieldset}>
        <legend>
          Links ({values.links.length}/{MAX_LINKS})
        </legend>
        <div className={styles.linkList}>
          {values.links.map((link, index) => (
            <LinkRow
              key={link.id}
              link={link}
              index={index}
              urlError={errors.links[link.id]?.url}
              labelError={errors.links[link.id]?.label}
              showUrlError={touchedLinkUrlIds.has(link.id)}
              showLabelError={touchedLinkLabelIds.has(link.id)}
              canRemove={!linkCountAtMin}
              onUrlChange={handleLinkUrlChange}
              onLabelChange={handleLinkLabelChange}
              onUrlBlur={handleLinkUrlBlur}
              onLabelBlur={handleLinkLabelBlur}
              onRemove={handleRemoveLink}
            />
          ))}
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={handleAddLink}
          disabled={linkCountAtMax}
        >
          Add another link
        </button>
        {linkCountAtMax ? (
          <p className={styles.fieldHint}>
            You&apos;ve reached the maximum of {MAX_LINKS} links.
          </p>
        ) : null}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor="trove-expiration">Expiration</label>
        <select
          id="trove-expiration"
          value={values.expiration}
          onChange={handleExpirationChange}
        >
          {formMode === 'edit' ? (
            <option value="">
              Keep current (expires {formatExpiresAt(currentExpiresAt)})
            </option>
          ) : null}
          {EXPIRATION_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Password protection</legend>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values.passwordEnabled}
            onChange={handlePasswordToggle}
          />
          <span>Require a password to view this trove</span>
        </label>
        {values.mode === 'private' ? (
          <p className={styles.fieldHint}>
            This password is combined, entirely in your browser, with a secret
            carried in your share link&apos;s URL fragment — both are required
            to decrypt. The password itself is never sent to the server.
            Vultrove cannot recover it, or the share link, if either is lost.
          </p>
        ) : (
          <p className={styles.fieldHint}>
            This password is checked by the server before showing the
            trove&apos;s contents — it is an access gate, not encryption.
            Vultrove cannot recover it if it&apos;s lost.
          </p>
        )}
        {values.passwordEnabled ? (
          <div className={styles.field}>
            <label htmlFor="trove-password">Password</label>
            <input
              id="trove-password"
              type="password"
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              value={values.password}
              onChange={handlePasswordChange}
              onBlur={() => setTouchedPassword(true)}
              aria-invalid={showPasswordError ? 'true' : undefined}
              aria-describedby={
                [
                  allowUnchangedPassword ? 'trove-password-hint' : null,
                  showPasswordError ? 'trove-password-error' : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
            {allowUnchangedPassword ? (
              <p className={styles.fieldHint} id="trove-password-hint">
                Leave blank to keep the current password unchanged.
              </p>
            ) : null}
            {showPasswordError ? (
              <p className={styles.fieldError} id="trove-password-error">
                {errors.password}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {formMode === 'edit' && values.mode === 'private' ? (
        <p className={styles.fieldHint} role="note">
          Saving any change re-encrypts this trove with a fresh key and a new
          share link. The current share link will stop working.
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="submit"
          className="button"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>

      {submitAttempted && formHasErrors(errors) ? (
        <p role="alert" className={styles.formStatus}>
          Please fix the highlighted fields before continuing.
        </p>
      ) : null}

      {submitError ? (
        <p role="alert" className={styles.formStatus}>
          {submitError}
        </p>
      ) : null}
    </form>
  )
}
