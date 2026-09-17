import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { updatePrivateTrove } from '../../api/private-troves'
import { ApiError } from '../../api/client'
import { buildPrivateShareUrl } from '../../api/urls'
import type { PrivateEnvelope } from '../../api/private-types'
import type { TroveId } from '../../crypto/ids'
import { parseFragment } from '../../crypto/private-fragment'
import { parsePrivateEnvelope } from '../../crypto/private-envelope-validation'
import {
  createPrivateEnvelope,
  openPrivateEnvelope,
} from '../../crypto/private-envelope'
import { PrivateCryptoUnavailableError } from '../../crypto/private-envelope-errors'
import { encodeFragment } from '../../crypto/private-fragment'
import type { PrivateContentPlaintext } from '../../crypto/private-trove'
import { TroveForm } from '../create-trove/TroveForm'
import type { TroveFormValues } from '../create-trove/types'
import {
  fromPrivateContent,
  toPrivateContent,
} from '../create-trove/private-content'
import { CopyableUrl } from '../create-trove/CreationSuccess'
import styles from '../ManagementPage.module.css'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const OPEN_FAILURE =
  'That link and/or password could not open this trove. Check that you ' +
  'pasted the complete share link, including everything after "#".'
// See CreateTrovePage's/PublicTrovePage's identical guard: both unlocking
// (to view/edit plaintext) and saving (re-encrypting) a Private Trove
// need crypto.subtle, available only in a secure context.
const PRIVATE_CRYPTO_UNAVAILABLE_ERROR =
  "This browser can't do the encryption Private Troves require: Web " +
  'Crypto is only available in a secure context — an https:// page, or ' +
  'http://localhost. This page was loaded over plain HTTP at a ' +
  "non-localhost address, so it isn't available here."

export interface PrivateManagementPanelProps {
  troveId: TroveId
  managementId: string
  managementSecret: string
  envelope: PrivateEnvelope
  expiresAt: string | null
}

/**
 * Editing a Private Trove from the management page (docs/PRIVATE_ENVELOPE.md
 * §16/§17, task requirement: "management must also obtain the current
 * share/decryption capability before plaintext editing can occur").
 * `managementId`/`managementSecret` alone authorize replacing/deleting the
 * trove, but never grant decryption — this component explicitly prompts
 * for the current share URL/fragment (and, for password mode, the current
 * password) before any plaintext can be shown or edited, rather than
 * silently assuming the two capabilities are related.
 *
 * Deletion does not need this component at all (`ManagementPage` handles
 * it directly with only the management secret) — nothing here is on that
 * path.
 */
export function PrivateManagementPanel({
  troveId,
  managementId,
  managementSecret,
  envelope: initialEnvelope,
  expiresAt: initialExpiresAt,
}: PrivateManagementPanelProps) {
  // This component owns its own copy of the envelope/expiresAt after a
  // successful save, so repeated edits within the same page view don't
  // require re-fetching the management view or re-supplying the
  // capability prompt again — the freshly rotated fragment is already
  // known locally from the save that just happened.
  const [envelope, setEnvelope] = useState<PrivateEnvelope>(initialEnvelope)
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt)

  const [capabilityInput, setCapabilityInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const [unlockedContent, setUnlockedContent] =
    useState<PrivateContentPlaintext | null>(null)
  // Prefills the edit form's password field so "save without touching the
  // password" re-uses the same password text rather than requiring the
  // creator to retype it — Private mode has no server-side "leave blank to
  // keep unchanged" concept (every edit re-derives the KEK from an actual
  // password string, docs/PRIVATE_ENVELOPE.md §17), so this is the
  // mechanism that plays that role here instead.
  const [unlockedPassword, setUnlockedPassword] = useState('')

  const [formResetCount, setFormResetCount] = useState(0)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [savedShareUrl, setSavedShareUrl] = useState<string | null>(null)
  // Same reasoning as CreateTrovePage's identical guard: `handleEditSubmit`
  // runs Argon2id client-side for a password-protected trove, expensive
  // enough that a fast repeated Enter/click racing past TroveForm's own
  // `submitting`-gated disabled state is worth defending against here too.
  const editSubmissionInFlight = useRef(false)
  // The rotated-share-URL notice is rendered right after the Save
  // changes button (not at the top of the page, where a long form would
  // put it out of view of whoever just clicked Save) — this ref lets it
  // additionally pull attention to itself on each new rotation, since the
  // page doesn't otherwise scroll there on its own.
  const savedShareNoticeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (savedShareUrl === null) {
      return
    }
    savedShareNoticeRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
    })
    savedShareNoticeRef.current?.focus()
  }, [savedShareUrl])

  function extractFragmentText(input: string): string {
    const trimmed = input.trim()
    const hashIndex = trimmed.indexOf('#')
    return hashIndex === -1 ? trimmed : trimmed.slice(hashIndex + 1)
  }

  async function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unlocking) {
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const parsedEnvelope = parsePrivateEnvelope(JSON.stringify(envelope))
      let fragmentSecret: Uint8Array
      try {
        fragmentSecret = parseFragment(extractFragmentText(capabilityInput))
      } catch {
        setUnlockError(OPEN_FAILURE)
        return
      }
      const password =
        parsedEnvelope.mode === 'password' ? passwordInput : undefined
      const content = await openPrivateEnvelope(
        troveId,
        parsedEnvelope,
        fragmentSecret,
        password,
      )
      if (content === null) {
        setUnlockError(OPEN_FAILURE)
        return
      }
      setUnlockedContent(content)
      setUnlockedPassword(password ?? '')
    } catch (err) {
      setUnlockError(
        err instanceof PrivateCryptoUnavailableError
          ? PRIVATE_CRYPTO_UNAVAILABLE_ERROR
          : OPEN_FAILURE,
      )
    } finally {
      setUnlocking(false)
    }
  }

  async function handleEditSubmit(values: TroveFormValues) {
    if (editSubmissionInFlight.current) {
      return
    }
    editSubmissionInFlight.current = true
    setEditSubmitting(true)
    setEditError(null)
    try {
      const content = toPrivateContent(values)
      const password = values.passwordEnabled ? values.password : undefined
      // docs/PRIVATE_ENVELOPE.md §17: every successful edit fully
      // rotates — fresh content key, fresh nonces, and (password mode)
      // a fresh fragment secret — regardless of which fields actually
      // changed, including an expiration-only save.
      const { envelope: newEnvelope, fragmentSecret: newFragmentSecret } =
        await createPrivateEnvelope(troveId, content, password)

      const expiration =
        values.expiration === '' ? undefined : values.expiration
      const updated = await updatePrivateTrove(managementId, managementSecret, {
        envelope: newEnvelope,
        expiration,
      })

      const newFragment = encodeFragment(newFragmentSecret)
      const newShareUrl = buildPrivateShareUrl(troveId, newFragment)

      setEnvelope(updated.envelope)
      setExpiresAt(updated.expiresAt)
      setUnlockedContent(content)
      setUnlockedPassword(password ?? '')
      setSavedShareUrl(newShareUrl)
      setFormResetCount((count) => count + 1)
    } catch (err) {
      if (err instanceof PrivateCryptoUnavailableError) {
        setEditError(PRIVATE_CRYPTO_UNAVAILABLE_ERROR)
      } else {
        setEditError(err instanceof ApiError ? err.message : GENERIC_ERROR)
      }
    } finally {
      editSubmissionInFlight.current = false
      setEditSubmitting(false)
    }
  }

  if (unlockedContent === null) {
    return (
      <section className={styles.privatePanel}>
        <h2>Unlock to edit content</h2>
        <p className={styles.statusNote}>
          Editing a Private Trove's content requires its current share link (or
          just the part after "#") — the management link alone authorizes
          deletion, but never decryption. Paste it below.
          {envelope.mode === 'password'
            ? ' This trove is also password-protected — enter the current password as well.'
            : ''}
        </p>
        <form
          className={styles.privateUnlockForm}
          onSubmit={(event) => void handleUnlockSubmit(event)}
          noValidate
        >
          <div className={styles.field}>
            <label htmlFor="capability-input">
              Current share link (or fragment)
            </label>
            <input
              id="capability-input"
              type="text"
              autoComplete="off"
              value={capabilityInput}
              onChange={(event) => setCapabilityInput(event.target.value)}
              placeholder="https://…/c/…#v1...."
            />
          </div>
          {envelope.mode === 'password' ? (
            <div className={styles.field}>
              <label htmlFor="capability-password">Current password</label>
              <input
                id="capability-password"
                type="password"
                autoComplete="current-password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
              />
            </div>
          ) : null}
          <button
            type="submit"
            className="button"
            disabled={unlocking || capabilityInput.trim().length === 0}
            aria-busy={unlocking}
          >
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
          {unlockError ? (
            <p role="alert" className={styles.statusNote}>
              {unlockError}
            </p>
          ) : null}
        </form>
      </section>
    )
  }

  return (
    <>
      <TroveForm
        key={formResetCount}
        formMode="edit"
        initialValues={fromPrivateContent(unlockedContent, {
          passwordEnabled: envelope.mode === 'password',
          password: unlockedPassword,
        })}
        currentExpiresAt={expiresAt ? new Date(expiresAt) : null}
        onSubmit={handleEditSubmit}
        submitLabel="Save changes"
        submitting={editSubmitting}
        submitError={editError}
      />

      {savedShareUrl ? (
        // Deliberately placed immediately after the form/Save button
        // (never at the top of the page) — this is what was easy to miss:
        // a long form put the old top-of-page placement far below where
        // the user's attention already was after clicking Save.
        <section
          className={styles.privatePanel}
          role="status"
          tabIndex={-1}
          ref={savedShareNoticeRef}
        >
          <h2>Your share link has changed</h2>
          <p className={styles.statusNote}>
            Private troves generate a new share link when saved.{' '}
            <strong>The previous share link no longer works.</strong> Copy the
            new link below.
          </p>
          <CopyableUrl
            id="new-share-url"
            label="New share link"
            url={savedShareUrl}
          />
        </section>
      ) : null}
    </>
  )
}
