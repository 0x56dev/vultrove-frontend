import { NoticePage } from '../components/NoticePage'
import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { updateStandardTrove, deleteTrove } from '../api/standard-troves'
import { getManagementViewAny } from '../api/private-troves'
import { ApiError } from '../api/client'
import type {
  ManagementStandardTroveViewBody,
  UpdateStandardTroveRequestBody,
} from '../api/types'
import type { ManagementPrivateTroveViewBody } from '../api/private-types'
import type { TroveId } from '../crypto/ids'
import { TroveForm } from './create-trove/TroveForm'
import type { TroveFormValues } from './create-trove/types'
import {
  toWireDescription,
  toWireLinks,
  toWirePassword,
} from './create-trove/to-wire'
import { PrivateManagementPanel } from './private-management/PrivateManagementPanel'
import styles from './ManagementPage.module.css'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const INVALID_LINK_MESSAGE =
  'This management link is invalid or has expired. Double-check the full ' +
  'link, including everything after the "#" — it must be pasted exactly ' +
  'as it was given to you.'

type PageState =
  | { status: 'loading' }
  /** Covers: missing/empty fragment (never sent to the server), an
   * unknown managementId, a wrong secret, and a correct secret against a
   * since-expired trove — all deliberately indistinguishable
   * (docs/API_CONTRACT.md §5/§5.6). */
  | { status: 'invalid-link' }
  | {
      status: 'loaded'
      view: ManagementStandardTroveViewBody | ManagementPrivateTroveViewBody
    }
  | { status: 'error'; message: string }
  | { status: 'deleted' }

function managementViewToFormValues(
  view: ManagementStandardTroveViewBody,
): TroveFormValues {
  return {
    mode: 'standard',
    title: view.title,
    description: view.description ?? '',
    links: view.links.map((link, index) => ({
      id: `link-${index}`,
      url: link.url,
      label: link.label ?? '',
    })),
    // '' = "keep current expiration" — see TroveForm's formMode="edit".
    expiration: '',
    // The password itself is never returned by any endpoint (§8) — only
    // whether one is currently set. A blank field with passwordEnabled
    // already true is what lets TroveForm's "leave blank to keep current
    // password" affordance work for an already-protected trove.
    passwordEnabled: view.passwordProtected,
    password: '',
  }
}

export function ManagementPage() {
  const { managementId } = useParams<{ managementId: string }>()
  // Keying on managementId forces a full remount (fresh state, and a
  // fresh read of window.location.hash) if it ever changes, instead of
  // an effect resetting state to 'loading' mid-flight — keeps every
  // setState call in the inner component confined to promise callbacks
  // and event handlers, never the effect body itself.
  return (
    <ManagementContent key={managementId ?? ''} managementId={managementId} />
  )
}

function ManagementContent({
  managementId,
}: {
  managementId: string | undefined
}) {
  // Read once, on mount, directly from the address bar — never through
  // React Router (a URL fragment is never part of route matching) and
  // never written back (docs/API_CONTRACT.md §2.4: the fragment is never
  // sent to the server as part of navigation; this slice additionally
  // keeps it in the address bar rather than clearing it via
  // history.replaceState, so the link stays refreshable/bookmarkable).
  const [secret] = useState<string>(() => window.location.hash.slice(1))

  const [state, setState] = useState<PageState>(() =>
    managementId && secret !== ''
      ? { status: 'loading' }
      : { status: 'invalid-link' },
  )
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Bumped on every successful save, and used as TroveForm's `key` below,
  // so a successful edit remounts the form from the fresh server
  // response instead of leaving stale local field state in place — most
  // importantly, this clears a just-submitted plaintext password out of
  // the form's own state rather than leaving it sitting there indefinitely.
  const [formResetCount, setFormResetCount] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const isFirstConfirmRender = useRef(true)

  useEffect(() => {
    if (!managementId || secret === '') {
      // Missing/empty fragment: already reflected in the initial state
      // above. Never issue a request with an empty credential — there is
      // nothing to check server-side, and doing so would be a pointless
      // authenticated call with a guaranteed-invalid secret.
      return
    }

    let ignore = false

    getManagementViewAny(managementId, secret)
      .then((view) => {
        if (!ignore) {
          setState({ status: 'loaded', view })
        }
      })
      .catch((err: unknown) => {
        if (ignore) {
          return
        }
        if (err instanceof ApiError && err.code === 'unauthorized') {
          setState({ status: 'invalid-link' })
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
  }, [managementId, secret])

  // Moves focus to whichever control just appeared — the confirm button
  // when the confirmation panel opens, back to "Delete trove" when it
  // closes (cancel or Escape) — so keyboard/screen-reader users land
  // somewhere sensible instead of on a now-vanished element. Skips the
  // very first render so mounting the page never steals focus from
  // wherever the user already is.
  useEffect(() => {
    if (isFirstConfirmRender.current) {
      isFirstConfirmRender.current = false
      return
    }
    if (confirmingDelete) {
      confirmButtonRef.current?.focus()
    } else {
      deleteButtonRef.current?.focus()
    }
  }, [confirmingDelete])

  async function handleEditSubmit(values: TroveFormValues) {
    if (!managementId || secret === '') {
      return
    }
    setEditSubmitting(true)
    setEditError(null)
    try {
      const patch: UpdateStandardTroveRequestBody = {
        title: values.title,
        description: toWireDescription(values.description),
        links: toWireLinks(values),
      }
      if (values.expiration !== '') {
        patch.expiration = values.expiration
      }
      // omitWhenUnchanged: true — a blank password while still enabled
      // means "leave the existing password as-is" (validated by
      // TroveForm), so the field is omitted from the PATCH entirely
      // rather than resent, matching the server's documented "omitted
      // field left unchanged" semantics (docs/API_CONTRACT.md §5.1).
      const password = toWirePassword(values, { omitWhenUnchanged: true })
      if (password !== undefined) {
        patch.password = password
      }
      const updated = await updateStandardTrove(managementId, secret, patch)
      // docs' "update UI from the authoritative returned representation":
      // PATCH already returns the full post-edit management view, so this
      // reflects the save without a separate authenticated re-fetch.
      setState({ status: 'loaded', view: updated })
      setFormResetCount((count) => count + 1)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        setState({ status: 'invalid-link' })
      } else {
        setEditError(err instanceof ApiError ? err.message : GENERIC_ERROR)
      }
    } finally {
      setEditSubmitting(false)
    }
  }

  function handleCancelDelete() {
    setConfirmingDelete(false)
    setDeleteError(null)
  }

  async function handleConfirmDelete() {
    if (!managementId || secret === '') {
      return
    }
    setDeleteSubmitting(true)
    setDeleteError(null)
    try {
      await deleteTrove(managementId, secret)
      // Deleted: move to a terminal state. Nothing below this point ever
      // issues another authenticated management request for this trove —
      // there is no retry/refresh path back into 'loaded'.
      setState({ status: 'deleted' })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        setState({ status: 'invalid-link' })
      } else {
        setDeleteError(err instanceof ApiError ? err.message : GENERIC_ERROR)
        setDeleteSubmitting(false)
      }
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page">
        <p role="status">Loading management view…</p>
      </div>
    )
  }

  if (state.status === 'invalid-link') {
    return (
      <NoticePage>
        <h1>Invalid management link</h1>
        <p role="status">{INVALID_LINK_MESSAGE}</p>
      </NoticePage>
    )
  }

  if (state.status === 'error') {
    return (
      <NoticePage>
        <h1>Something went wrong</h1>
        <p role="alert">{state.message}</p>
      </NoticePage>
    )
  }

  if (state.status === 'deleted') {
    return (
      <div className="page">
        <h1>Trove deleted</h1>
        <p role="status">
          This trove has been deleted and is no longer available.
        </p>
        <Link to="/create" className="button">
          Create a new trove
        </Link>
      </div>
    )
  }

  const { view } = state

  return (
    <div className="page">
      <h1>Manage trove</h1>
      {view.mode === 'private' ? (
        <p className={styles.publicLinkRow}>
          Public trove ID: <code>{view.troveId}</code> — the actual share link
          (with its decryption fragment) is only known to whoever holds it; it
          can't be reconstructed from the management link alone.
        </p>
      ) : (
        <p className={styles.publicLinkRow}>
          Share link:{' '}
          <Link to={`/c/${encodeURIComponent(view.troveId)}`}>
            {window.location.origin}/c/{view.troveId}
          </Link>
        </p>
      )}

      {view.mode === 'private' ? (
        <PrivateManagementPanel
          troveId={view.troveId as TroveId}
          managementId={managementId as string}
          managementSecret={secret}
          envelope={view.envelope}
          expiresAt={view.expiresAt}
        />
      ) : (
        <TroveForm
          key={formResetCount}
          formMode="edit"
          initialValues={managementViewToFormValues(view)}
          currentExpiresAt={view.expiresAt ? new Date(view.expiresAt) : null}
          onSubmit={handleEditSubmit}
          submitLabel="Save changes"
          submitting={editSubmitting}
          submitError={editError}
        />
      )}

      <section className={styles.dangerZone}>
        <h2>Delete this trove</h2>
        <p className={styles.statusNote}>
          This cannot be undone. The trove becomes immediately unavailable.
        </p>
        {!confirmingDelete ? (
          <button
            type="button"
            className="button button--secondary"
            ref={deleteButtonRef}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete trove
          </button>
        ) : (
          <div
            className={styles.confirmRow}
            role="group"
            aria-label="Confirm deletion"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                handleCancelDelete()
              }
            }}
          >
            <p role="alert" className={styles.statusNote}>
              Are you sure? This permanently deletes the trove.
            </p>
            <button
              type="button"
              className={`button ${styles.buttonDanger}`}
              ref={confirmButtonRef}
              disabled={deleteSubmitting}
              aria-busy={deleteSubmitting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleteSubmitting ? 'Deleting…' : 'Yes, delete permanently'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={deleteSubmitting}
              onClick={handleCancelDelete}
            >
              Cancel
            </button>
          </div>
        )}
        {deleteError ? (
          <p role="alert" className={styles.statusNote}>
            {deleteError}
          </p>
        ) : null}
      </section>
    </div>
  )
}
