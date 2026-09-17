import type { WireLink, WirePassword } from '../../api/types'
import type { TroveFormValues } from './types'

/**
 * Shared form-state -> wire-shape mapping used by both the create and
 * edit flows (`CreateTrovePage`, `ManagementPage`) — an empty string means
 * "not set" in form state, but `null` on the wire (docs/API_CONTRACT.md
 * §3.1), so this conversion happens in exactly one place.
 */

export function toWireDescription(description: string): string | null {
  return description.trim() === '' ? null : description
}

export function toWireLinks(values: TroveFormValues): WireLink[] {
  return values.links.map((link) => ({
    url: link.url,
    label: link.label.trim() === '' ? null : link.label,
  }))
}

/**
 * Maps form state to the wire `password` field (docs/API_CONTRACT.md
 * §3.1/§5.1). A blank value while `passwordEnabled` is true only ever
 * means "keep the existing password unchanged" (`TroveForm`'s edit-mode
 * "leave blank to keep" affordance — validation already requires the
 * create form, and an edit newly enabling protection, to have a non-blank
 * value by the time this runs).
 *
 * `omitWhenUnchanged: true` (edit mode only) returns `undefined` for that
 * case, so the caller can omit `password` from the `PATCH` body entirely
 * — the server's documented "omitted field left unchanged" semantics —
 * rather than resending a value it never had. The create form always
 * calls this without that option, since a `password` field is required on
 * every creation request and there is no "unchanged" concept yet.
 */
export function toWirePassword(
  values: TroveFormValues,
  options: { omitWhenUnchanged?: boolean } = {},
): WirePassword | undefined {
  if (!values.passwordEnabled) {
    return { enabled: false }
  }
  if (values.password === '' && options.omitWhenUnchanged) {
    return undefined
  }
  return { enabled: true, value: values.password }
}
