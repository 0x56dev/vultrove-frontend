import type { PrivateContentPlaintext } from '../../crypto/private-trove'
import type { LinkEntry, TroveFormValues } from './types'

/**
 * Form-state <-> Private content-plaintext mapping — the Private-mode
 * counterpart to `to-wire.ts`, which only ever produces the *Standard*
 * wire shape. Private content never touches the wire at all: this module
 * only builds/reads the canonical plaintext object
 * (docs/PRIVATE_ENVELOPE.md §2) that `createPrivateEnvelope`/
 * `openPrivateEnvelope` (`../../crypto/private-envelope.ts`)
 * encrypt/decrypt entirely in the browser.
 */

export function toPrivateContent(
  values: TroveFormValues,
): PrivateContentPlaintext {
  return {
    schemaVersion: 1,
    title: values.title,
    description: values.description.trim() === '' ? null : values.description,
    links: values.links.map((link) => ({
      url: link.url,
      label: link.label.trim() === '' ? null : link.label,
    })),
  }
}

/**
 * The inverse mapping, used to populate the edit form after a successful
 * local decrypt. `passwordEnabled`/`password` are supplied by the caller
 * (`ManagementPage`'s Private flow) rather than derived here, since
 * whether the trove is currently password-protected is a property of the
 * *envelope* (`envelope.mode`), not of the decrypted content plaintext.
 */
export function fromPrivateContent(
  content: PrivateContentPlaintext,
  options: { passwordEnabled: boolean; password: string },
): TroveFormValues {
  const links: LinkEntry[] = content.links.map((link, index) => ({
    id: `link-${index}`,
    url: link.url,
    label: link.label ?? '',
  }))
  return {
    mode: 'private',
    title: content.title,
    description: content.description ?? '',
    links,
    // '' = "keep current expiration" (TroveForm's formMode="edit").
    expiration: '',
    passwordEnabled: options.passwordEnabled,
    password: options.password,
  }
}
