import type { LinkEntry } from './types'
import { MAX_LABEL_LENGTH, MAX_URL_LENGTH } from './validation'
import styles from './TroveForm.module.css'
import instrument from './CreateInstrument.module.css'

interface LinkRowProps {
  instrumentLayout?: boolean
  link: LinkEntry
  index: number
  urlError?: string
  labelError?: string
  showUrlError: boolean
  showLabelError: boolean
  canRemove: boolean
  onUrlChange: (id: string, url: string) => void
  onLabelChange: (id: string, label: string) => void
  onUrlBlur: (id: string) => void
  onLabelBlur: (id: string) => void
  onRemove: (id: string) => void
}

export function LinkRow({
  instrumentLayout = false,
  link,
  index,
  urlError,
  labelError,
  showUrlError,
  showLabelError,
  canRemove,
  onUrlChange,
  onLabelChange,
  onUrlBlur,
  onLabelBlur,
  onRemove,
}: LinkRowProps) {
  const urlFieldId = `link-${link.id}-url`
  const labelFieldId = `link-${link.id}-label`
  const urlErrorId = `link-${link.id}-url-error`
  const labelErrorId = `link-${link.id}-label-error`
  const displayUrlError = showUrlError ? urlError : undefined
  const displayLabelError = showLabelError ? labelError : undefined

  return (
    <div className={instrumentLayout ? instrument.linkRow : styles.linkRow}>
      {instrumentLayout ? (
        <span className={instrument.linkIndex} aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      ) : null}
      <div className={styles.field}>
        <label htmlFor={urlFieldId}>Link {index + 1} URL</label>
        <input
          id={urlFieldId}
          type="url"
          inputMode="url"
          autoComplete="off"
          maxLength={MAX_URL_LENGTH}
          value={link.url}
          placeholder="https://example.com/file"
          onChange={(event) => onUrlChange(link.id, event.target.value)}
          onBlur={() => onUrlBlur(link.id)}
          aria-invalid={displayUrlError ? 'true' : undefined}
          aria-describedby={displayUrlError ? urlErrorId : undefined}
        />
        {displayUrlError ? (
          <p className={styles.fieldError} id={urlErrorId}>
            {displayUrlError}
          </p>
        ) : null}
      </div>
      <div className={styles.field}>
        <label htmlFor={labelFieldId}>Label (optional)</label>
        <input
          id={labelFieldId}
          type="text"
          autoComplete="off"
          maxLength={MAX_LABEL_LENGTH}
          value={link.label}
          placeholder="e.g. Mirror 1"
          onChange={(event) => onLabelChange(link.id, event.target.value)}
          onBlur={() => onLabelBlur(link.id)}
          aria-invalid={displayLabelError ? 'true' : undefined}
          aria-describedby={displayLabelError ? labelErrorId : undefined}
        />
        {displayLabelError ? (
          <p className={styles.fieldError} id={labelErrorId}>
            {displayLabelError}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => onRemove(link.id)}
        disabled={!canRemove}
      >
        Remove link {index + 1}
      </button>
    </div>
  )
}
