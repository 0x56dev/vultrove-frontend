import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getTrove } from '../api/private-troves'
import { unlockStandardTrove } from '../api/standard-troves'
import { ApiError } from '../api/client'
import { isLockedTroveView } from '../api/types'
import type { PublicStandardTroveViewContentBody } from '../api/types'
import type { PublicPrivateTroveViewBody } from '../api/private-types'
import type { TroveId } from '../crypto/ids'
import { parseFragment } from '../crypto/private-fragment'
import { parsePrivateEnvelope } from '../crypto/private-envelope-validation'
import { openPrivateEnvelope } from '../crypto/private-envelope'
import {
  PrivateEnvelopeValidationError,
  PrivateCryptoUnavailableError,
} from '../crypto/private-envelope-errors'
import type { PrivateContentPlaintext } from '../crypto/private-trove'
import styles from './PublicTrovePage.module.css'

const GENERIC_ERROR =
  'Something went wrong loading this trove. Please try again.'
// docs/PRIVATE_ENVELOPE.md §18/§20: a single generic failure for every
// cause (missing/malformed fragment, wrong password, tampered ciphertext,
// tampered AAD-bound field) — deliberately never distinguished.
const PRIVATE_OPEN_FAILURE =
  'This link could not open this trove. Check that you pasted the ' +
  'complete link, including everything after "#", and the password if ' +
  'one is required.'
// See CreateTrovePage's identical guard: decrypting a Private Trove also
// requires crypto.subtle, available only in a secure context.
const PRIVATE_CRYPTO_UNAVAILABLE_ERROR =
  "This browser can't decrypt this trove: Private Troves need Web " +
  'Crypto, which is only available in a secure context — an https:// ' +
  'page, or http://localhost. This page was loaded over plain HTTP at ' +
  "a non-localhost address, so it isn't available here."

type PageState =
  | { status: 'loading' }
  | { status: 'locked'; expiresAt: string | null }
  | { status: 'success'; trove: PublicStandardTroveViewContentBody }
  | {
      status: 'private-ready'
      troveId: TroveId
      view: PublicPrivateTroveViewBody
      fragmentSecret: Uint8Array
    }
  | {
      status: 'private-decrypted'
      content: PrivateContentPlaintext
      expiresAt: string | null
    }
  | { status: 'private-invalid-link' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function formatExpiresAt(expiresAt: string | null): string {
  if (expiresAt === null) {
    return 'Never'
  }
  return new Date(expiresAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function PublicTrovePage() {
  const { troveId } = useParams<{ troveId: string }>()
  // Keying on troveId forces a full remount (and thus a fresh initial
  // 'loading' state, and a fresh read of window.location.hash) whenever it
  // changes, instead of an effect resetting state to 'loading' mid-flight —
  // keeps every setState call inside this component confined to promise
  // callbacks, never the effect body itself.
  return <PublicTroveContent key={troveId ?? ''} troveId={troveId} />
}

function PublicTroveContent({ troveId }: { troveId: string | undefined }) {
  // Read once, on mount, directly from the address bar — never through
  // React Router (a URL fragment is never part of route matching) and
  // never sent to the server (docs/PRIVATE_ENVELOPE.md §15: the browser
  // must never include it in an HTTP request).
  const [rawFragment] = useState<string>(() => window.location.hash.slice(1))

  const [state, setState] = useState<PageState>(() =>
    troveId ? { status: 'loading' } : { status: 'not-found' },
  )

  useEffect(() => {
    if (!troveId) {
      return
    }

    let ignore = false

    getTrove(troveId)
      .then((trove) => {
        if (ignore) {
          return
        }

        if (trove.mode === 'private') {
          // docs/PRIVATE_ENVELOPE.md §15/§19/§20: a missing/malformed
          // fragment is rejected before any cryptographic operation, and
          // reported distinctly from a decryption failure (it's
          // detectable with zero crypto involved) — but still via the
          // same generic wording, never revealing which specific check
          // failed.
          let fragmentSecret: Uint8Array
          try {
            fragmentSecret = parseFragment(rawFragment)
          } catch {
            setState({ status: 'private-invalid-link' })
            return
          }
          setState({
            status: 'private-ready',
            troveId: troveId as TroveId,
            view: trove,
            fragmentSecret,
          })
          return
        }

        if (trove.mode !== 'standard') {
          // A response that matches neither the Private nor the Standard
          // discriminant this client knows about — never silently
          // treated as either shape (a naive "not private, so assume
          // Standard" branch would have to guess at `isLockedTroveView`
          // for a body it doesn't actually understand, and could easily
          // just render garbage instead of failing visibly).
          setState({ status: 'error', message: GENERIC_ERROR })
          return
        }

        // docs/API_CONTRACT.md §4.2: a password-gated trove's plain GET
        // never carries content — show the unlock prompt instead of
        // treating an absent title/description/links as an error.
        if (isLockedTroveView(trove)) {
          setState({ status: 'locked', expiresAt: trove.expiresAt })
        } else {
          setState({ status: 'success', trove })
        }
      })
      .catch((err: unknown) => {
        if (ignore) {
          return
        }
        if (err instanceof ApiError && err.code === 'not_found') {
          setState({ status: 'not-found' })
        } else {
          setState({
            status: 'error',
            message: err instanceof ApiError ? err.message : GENERIC_ERROR,
          })
        }
      })

    return () => {
      ignore = true
    }
  }, [troveId, rawFragment])

  if (state.status === 'loading') {
    return (
      <div className="page">
        <p role="status">Loading trove…</p>
      </div>
    )
  }

  if (state.status === 'locked') {
    return (
      <PasswordPrompt
        troveId={troveId as string}
        expiresAt={state.expiresAt}
        onUnlocked={(trove) => setState({ status: 'success', trove })}
        onNotFound={() => setState({ status: 'not-found' })}
      />
    )
  }

  if (state.status === 'private-ready') {
    return (
      <PrivateUnlock
        troveId={state.troveId}
        view={state.view}
        fragmentSecret={state.fragmentSecret}
        onDecrypted={(content) =>
          setState({
            status: 'private-decrypted',
            content,
            expiresAt: state.view.expiresAt,
          })
        }
      />
    )
  }

  if (state.status === 'private-invalid-link') {
    return (
      <div className="page">
        <h1>This link is incomplete</h1>
        <p role="status">{PRIVATE_OPEN_FAILURE}</p>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="page">
        <h1>Trove not available</h1>
        <p role="status">
          This trove is not available. It may have been deleted, expired, or
          never existed.
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="page">
        <h1>Something went wrong</h1>
        <p role="alert">{state.message}</p>
      </div>
    )
  }

  if (state.status === 'private-decrypted') {
    return (
      <TroveContentView
        title={state.content.title}
        description={state.content.description}
        links={state.content.links}
        expiresAt={state.expiresAt}
      />
    )
  }

  const { trove } = state
  return (
    <TroveContentView
      title={trove.title}
      description={trove.description}
      links={trove.links}
      expiresAt={trove.expiresAt}
    />
  )
}

interface TroveContentViewProps {
  title: string
  description: string | null
  links: ReadonlyArray<{ url: string; label: string | null }>
  expiresAt: string | null
}

/**
 * Shared rendering for both Standard and (decrypted) Private content —
 * plaintext React rendering only, no `dangerouslySetInnerHTML` and no
 * Markdown parsing, for either mode.
 */
function TroveContentView({
  title,
  description,
  links,
  expiresAt,
}: TroveContentViewProps) {
  return (
    <div className="page">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      <p className={styles.meta}>Expires: {formatExpiresAt(expiresAt)}</p>

      <ul className={styles.linkList}>
        {links.map((link, index) => (
          // Public trove IDs/links carry no stable identifier of their own
          // (docs/API_CONTRACT.md §4.1) — index is safe here because this
          // list is re-fetched/re-decrypted and replaced wholesale, never
          // reordered in place.
          <li key={index} className={styles.linkItem}>
            <a
              className={styles.linkLabel}
              href={link.url}
              target="_blank"
              // docs/THREAT_MODEL.md §25: a strict referrer policy for
              // outbound link clicks so the container ID isn't disclosed
              // to the destination via the Referer header; `noopener`
              // additionally prevents the destination page from getting a
              // `window.opener` handle back to this tab (reverse
              // tabnabbing) — both are deliberate for links to arbitrary,
              // untrusted, creator-submitted destinations, not a
              // mechanical default.
              rel="noopener noreferrer"
            >
              {link.label ?? link.url}
            </a>
            {link.label ? (
              <span className={styles.linkUrl}>{link.url}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface PasswordPromptProps {
  troveId: string
  expiresAt: string | null
  onUnlocked: (trove: PublicStandardTroveViewContentBody) => void
  onNotFound: () => void
}

/**
 * A simple, mobile-friendly password prompt for a password-gated Standard
 * Trove (docs/API_CONTRACT.md §4.2, task requirement: "consistent with
 * the existing Vultrove UI"). Submits via `POST .../unlock` — the
 * password never touches the URL, and this component holds it only in
 * local state for the lifetime of the submit; nothing here persists it.
 * A wrong password produces the server's fixed, generic "Incorrect
 * password." text (never trove-specific detail) via the same
 * `ApiError.message` display pattern the rest of this app already uses
 * for safe-to-show server errors.
 */
function PasswordPrompt({
  troveId,
  expiresAt,
  onUnlocked,
  onNotFound,
}: PasswordPromptProps) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length === 0 || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const trove = await unlockStandardTrove(troveId, password)
      onUnlocked(trove)
    } catch (err) {
      // A trove that expires/is deleted between the initial GET and this
      // submission is a genuine (if rare) race — treat it the same as
      // any other not-found trove rather than an "incorrect password."
      if (err instanceof ApiError && err.code === 'not_found') {
        onNotFound()
        return
      }
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1>Password required</h1>
      <p className={styles.meta}>Expires: {formatExpiresAt(expiresAt)}</p>
      <p>This trove is password-protected. Enter the password to view it.</p>
      <form
        className={styles.unlockForm}
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        <div className={styles.field}>
          <label htmlFor="unlock-password">Password</label>
          <input
            id="unlock-password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'unlock-password-error' : undefined}
          />
        </div>
        <button
          type="submit"
          className="button"
          disabled={submitting || password.length === 0}
          aria-busy={submitting}
        >
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
        {error ? (
          <p
            role="alert"
            id="unlock-password-error"
            className={styles.formStatus}
          >
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}

interface PrivateUnlockProps {
  troveId: TroveId
  view: PublicPrivateTroveViewBody
  fragmentSecret: Uint8Array
  onDecrypted: (content: PrivateContentPlaintext) => void
}

/**
 * Handles both Private sub-modes entirely client-side
 * (docs/PRIVATE_ENVELOPE.md §11/§12/§18): `mode: "plain"` decrypts
 * immediately with no prompt; `mode: "password"` shows a local password
 * field first. Neither the fragment nor the password is ever sent to the
 * server — this component only ever calls `getTrove` (already done by
 * the caller) and local crypto (`openPrivateEnvelope`). A wrong password,
 * a corrupted fragment, or a tampered envelope all produce the same
 * generic failure (§18) — never distinguished, never causing any network
 * request.
 */
function PrivateUnlock({
  troveId,
  view,
  fragmentSecret,
  onDecrypted,
}: PrivateUnlockProps) {
  const [password, setPassword] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decryptInFlight = useRef(false)

  // docs/PRIVATE_ENVELOPE.md §19/§20: re-validate the server-supplied
  // envelope structurally before ever attempting to decrypt it — defense
  // in depth against a malformed/tampered response, independent of the
  // server's own write-time validation.
  const [parsedEnvelope] = useState(() => {
    try {
      return parsePrivateEnvelope(JSON.stringify(view.envelope))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (parsedEnvelope === null) {
      return
    }
    if (parsedEnvelope.mode !== 'plain') {
      return
    }
    if (decryptInFlight.current) {
      return
    }
    decryptInFlight.current = true
    let ignore = false
    setDecrypting(true)
    openPrivateEnvelope(troveId, parsedEnvelope, fragmentSecret)
      .then((content) => {
        if (ignore) {
          return
        }
        if (content === null) {
          setError(PRIVATE_OPEN_FAILURE)
          setDecrypting(false)
          return
        }
        onDecrypted(content)
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(
            err instanceof PrivateCryptoUnavailableError
              ? PRIVATE_CRYPTO_UNAVAILABLE_ERROR
              : PRIVATE_OPEN_FAILURE,
          )
          setDecrypting(false)
        }
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedEnvelope])

  if (parsedEnvelope === null) {
    return (
      <div className="page">
        <h1>This trove could not be opened</h1>
        <p role="status">{PRIVATE_OPEN_FAILURE}</p>
      </div>
    )
  }

  if (parsedEnvelope.mode === 'plain') {
    return (
      <div className="page">
        <p role={error ? 'alert' : 'status'}>{error ?? 'Decrypting…'}</p>
      </div>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length === 0 || decrypting || decryptInFlight.current) {
      return
    }
    decryptInFlight.current = true
    setDecrypting(true)
    setError(null)
    try {
      const content = await openPrivateEnvelope(
        troveId,
        parsedEnvelope!,
        fragmentSecret,
        password,
      )
      if (content === null) {
        setError(PRIVATE_OPEN_FAILURE)
        return
      }
      onDecrypted(content)
    } catch (err) {
      if (err instanceof PrivateCryptoUnavailableError) {
        setError(PRIVATE_CRYPTO_UNAVAILABLE_ERROR)
      } else {
        setError(
          err instanceof PrivateEnvelopeValidationError
            ? PRIVATE_OPEN_FAILURE
            : GENERIC_ERROR,
        )
      }
    } finally {
      decryptInFlight.current = false
      setDecrypting(false)
    }
  }

  return (
    <div className="page">
      <h1>Password required</h1>
      <p className={styles.meta}>Expires: {formatExpiresAt(view.expiresAt)}</p>
      <p>
        This trove is password-protected. Enter the password to decrypt it —
        this happens entirely in your browser and is never sent to the server.
      </p>
      <form
        className={styles.unlockForm}
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        <div className={styles.field}>
          <label htmlFor="private-unlock-password">Password</label>
          <input
            id="private-unlock-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? 'private-unlock-password-error' : undefined
            }
          />
        </div>
        <button
          type="submit"
          className="button"
          disabled={decrypting || password.length === 0}
          aria-busy={decrypting}
        >
          {decrypting ? 'Decrypting…' : 'Unlock'}
        </button>
        {error ? (
          <p
            role="alert"
            id="private-unlock-password-error"
            className={styles.formStatus}
          >
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
