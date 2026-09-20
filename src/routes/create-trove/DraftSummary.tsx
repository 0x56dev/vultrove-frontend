import { FoxSigil, IdentityField } from '../../visual/IdentityMarks'
import type { ExpirationSelection, TroveMode } from './types'
import { EXPIRATION_OPTIONS } from './validation'
import instrument from './CreateInstrument.module.css'

/** Read-only presentation. Raw URLs and passwords are never passed to this component.
 * The cosmetic components receive no props and retain the document's identity.
 */
export function DraftSummary({
  title,
  linkCount,
  mode,
  passwordEnabled,
  expiration,
}: {
  title: string
  linkCount: number
  mode: TroveMode
  passwordEnabled: boolean
  expiration: ExpirationSelection
}) {
  const expirationLabel =
    EXPIRATION_OPTIONS.find((option) => option.code === expiration)?.label ??
    'Keep current'
  return (
    <aside className={instrument.summary} aria-labelledby="draft-heading">
      <div className={instrument.summaryChrome}>
        <h2 id="draft-heading">Your trove / draft</h2>
        <span aria-hidden="true">↙</span>
      </div>
      <div className={instrument.summaryBody}>
        <div className={instrument.visitArt} aria-hidden="true">
          <IdentityField />
          <div className={instrument.visitSigil}>
            <FoxSigil />
          </div>
        </div>
        <p className={instrument.artLabel}>Visit artwork / purely cosmetic</p>
        <p className={instrument.draftTitle}>
          {title.trim() || 'Untitled trove'}
        </p>
        <div className={instrument.draftCount}>
          <span>{String(linkCount).padStart(2, '0')}</span>
          <span>{linkCount === 1 ? 'link slot' : 'link slots'}</span>
        </div>
        <dl className={instrument.summarySettings}>
          <div>
            <dt>Trove type</dt>
            <dd>{mode === 'private' ? 'Private' : 'Standard'}</dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd>{passwordEnabled ? 'Required' : 'Off'}</dd>
          </div>
          <div>
            <dt>Expiration</dt>
            <dd>{expirationLabel}</dd>
          </div>
        </dl>
        <p className={instrument.draftNote}>
          Not created yet.
          <br />
          Review your choices, then create below.
        </p>
      </div>
    </aside>
  )
}
