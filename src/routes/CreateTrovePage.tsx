import { useRef, useState } from 'react'
import instrument from './create-trove/CreateInstrument.module.css'
import { createStandardTrove } from '../api/standard-troves'
import { createPrivateTrove } from '../api/private-troves'
import { sendTelemetryEvent } from '../api/telemetry'
import { ApiError } from '../api/client'
import {
  buildPublicTroveUrl,
  buildManagementUrl,
  buildPrivateShareUrl,
} from '../api/urls'
import { generateManagementSecret, generateTroveId } from '../crypto/ids'
import { createPrivateEnvelope } from '../crypto/private-envelope'
import { encodeFragment } from '../crypto/private-fragment'
import { PrivateCryptoUnavailableError } from '../crypto/private-envelope-errors'
import { TroveForm } from './create-trove/TroveForm'
import { createInitialValues } from './create-trove/initial-values'
import type { TroveFormValues } from './create-trove/types'
import {
  toWireDescription,
  toWireLinks,
  toWirePassword,
} from './create-trove/to-wire'
import { toPrivateContent } from './create-trove/private-content'
import { CreationSuccess } from './create-trove/CreationSuccess'

const GENERIC_SUBMIT_ERROR = 'Something went wrong. Please try again.'
// docs/PRIVATE_ENVELOPE.md §14: Private Troves are encrypted with the
// browser's Web Crypto API, which every mainstream browser only exposes
// in a secure context (HTTPS, or http://localhost/127.0.0.1) — never a
// weaker fallback. A phone/tablet reaching a LAN dev server over plain
// http://<lan-ip>:<port> is the common way to hit this while testing on
// a physical device.
const PRIVATE_CRYPTO_UNAVAILABLE_ERROR =
  "Private troves need your browser's built-in encryption (Web Crypto), " +
  'which is only available in a secure context — an https:// page, or ' +
  'http://localhost. This page was loaded over plain HTTP at a ' +
  "non-localhost address, so it isn't available here. To test Private " +
  'troves from another device on your network, serve this dev server ' +
  'over HTTPS instead (for example with @vitejs/plugin-basic-ssl or ' +
  'mkcert/vite-plugin-mkcert) rather than plain HTTP.'
// docs/API_CONTRACT.md §2.1: a trove-ID collision is statistically
// negligible at 128 bits of entropy — this bound only exists so a
// pathological/adversarial server response can't hang the browser in an
// infinite retry loop.
const MAX_ID_CONFLICT_RETRIES = 5

interface CreatedTrove {
  troveId: string
  publicUrl: string
  managementUrl: string
  mode: 'standard' | 'private'
}

export function CreateTrovePage() {
  const [initialValues, setInitialValues] = useState(() =>
    createInitialValues('link-0'),
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedTrove | null>(null)
  // Guards against a duplicate Argon2id invocation from a double submit
  // (e.g. a fast repeated Enter/click) racing past TroveForm's own
  // `submitting`-gated disabled state — Argon2id is expensive enough that
  // two concurrent runs is worth defending against at this layer too, not
  // just trusting the UI to never re-enter.
  const submissionInFlight = useRef(false)

  async function handleSubmitStandard(values: TroveFormValues) {
    // docs/API_CONTRACT.md §2.2: client-generated, CSPRNG, 256 bits —
    // the existing browser-safe domain primitive, not a reimplementation.
    const managementSecret = generateManagementSecret()

    const response = await createStandardTrove(
      {
        title: values.title,
        description: toWireDescription(values.description),
        links: toWireLinks(values),
        // '' cannot occur here (only the edit form's "keep current"
        // sentinel ever produces it) — the create form always starts at
        // DEFAULT_EXPIRATION and offers no way to clear it.
        expiration: values.expiration === '' ? undefined : values.expiration,
        // toWirePassword() never omits the field here (no `omitWhenUnchanged`
        // option) — a `password` field is required on every creation
        // request (docs/API_CONTRACT.md §3.1), and the create form has
        // no "unchanged" concept, so this is always `{enabled:false}` or
        // `{enabled:true, value}`.
        password: toWirePassword(values) ?? { enabled: false },
      },
      managementSecret,
    )

    setCreated({
      troveId: response.troveId,
      publicUrl: buildPublicTroveUrl(response.troveId),
      // The secret lives only in this local variable and the URL string
      // built from it — never assigned to any broader-scoped state,
      // never persisted.
      managementUrl: buildManagementUrl(
        response.managementId,
        managementSecret,
      ),
      mode: 'standard',
    })
  }

  async function handleSubmitPrivate(values: TroveFormValues) {
    const managementSecret = generateManagementSecret()
    const content = toPrivateContent(values)
    const password = values.passwordEnabled ? values.password : undefined
    const expiration = values.expiration === '' ? undefined : values.expiration

    // docs/PRIVATE_ENVELOPE.md §4a: the client generates the trove ID
    // before encryption (it's bound into AAD) and regenerates both the ID
    // and the whole envelope on an id_conflict retry, rather than trying
    // to reuse partial state under a new binding.
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ID_CONFLICT_RETRIES; attempt++) {
      const troveId = generateTroveId()
      const { envelope, fragmentSecret } = await createPrivateEnvelope(
        troveId,
        content,
        password,
      )
      try {
        const response = await createPrivateTrove(
          troveId,
          envelope,
          expiration,
          managementSecret,
        )
        const fragment = encodeFragment(fragmentSecret)
        setCreated({
          troveId: response.troveId,
          publicUrl: buildPrivateShareUrl(response.troveId, fragment),
          managementUrl: buildManagementUrl(
            response.managementId,
            managementSecret,
          ),
          mode: 'private',
        })
        return
      } catch (err) {
        lastError = err
        if (err instanceof ApiError && err.code === 'id_conflict') {
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  async function handleSubmit(values: TroveFormValues) {
    if (submissionInFlight.current) {
      return
    }
    submissionInFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    // Fires exactly once per actual submit attempt (never on page load),
    // regardless of whether creation itself goes on to succeed or fail.
    // Best-effort by contract (docs/TELEMETRY.md): a failure here must
    // never surface to the user or affect trove creation, so its
    // rejection is swallowed right here rather than propagating into the
    // try/catch below.
    sendTelemetryEvent('create_submit_clicked').catch(() => {})
    try {
      if (values.mode === 'private') {
        await handleSubmitPrivate(values)
      } else {
        await handleSubmitStandard(values)
      }
    } catch (err) {
      if (err instanceof PrivateCryptoUnavailableError) {
        setSubmitError(PRIVATE_CRYPTO_UNAVAILABLE_ERROR)
      } else {
        setSubmitError(
          err instanceof ApiError ? err.message : GENERIC_SUBMIT_ERROR,
        )
      }
    } finally {
      submissionInFlight.current = false
      setSubmitting(false)
    }
  }

  // Returns to a clean creation form: clears the just-created trove's
  // share/management URLs (and the private fragment/management secret
  // embedded in them) out of this component's state entirely, clears any
  // leftover submit error, and generates a fresh set of initial values so
  // the remounted TroveForm below starts blank rather than reusing the
  // previous (already-submitted) form instance's state.
  function handleCreateAnother() {
    setCreated(null)
    setSubmitError(null)
    setInitialValues(createInitialValues('link-0'))
  }

  if (created) {
    return (
      <CreationSuccess
        troveId={created.troveId}
        publicUrl={created.publicUrl}
        managementUrl={created.managementUrl}
        mode={created.mode}
        onCreateAnother={handleCreateAnother}
      />
    )
  }

  return (
    <div className={instrument.page}>
      <header className={instrument.pageHeader}>
        <div>
          <p className={instrument.eyebrow}>Vultrove / Link assembly</p>
          <h1>
            Create a <span>trove</span>
          </h1>
        </div>
        <p className={instrument.introduction}>
          Bundle links into a trove, choose an expiration, and get a share link
          plus a separate management link to edit or delete it later.
        </p>
      </header>
      <TroveForm
        formMode="create"
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Create trove"
        submitting={submitting}
        submitError={submitError}
      />
    </div>
  )
}
