/**
 * Product-domain types for the trove creation form.
 *
 * These describe form state only — nothing here is a wire format, a
 * cryptographic envelope, or a stored record. See docs/V0.1_SPEC.md §1–§7
 * and docs/PRIVATE_ENVELOPE.md §2 for the actual product/protocol shapes
 * this form will eventually need to produce.
 */

export type TroveMode = 'standard' | 'private'

/**
 * The closed set of expiration codes defined in docs/V0.1_SPEC.md §10.
 * Form state stores this stable code, never the display label or a
 * duration — the code is the thing client and server implementations
 * agree on.
 */
export type ExpirationCode = '1h' | '1d' | '7d' | '30d' | '1y' | 'never'

export interface LinkEntry {
  /** Stable identity for React lists and field wiring — not a product id. */
  id: string
  url: string
  label: string
}

/**
 * `''` is a sentinel meaning "keep the current expiration unchanged" —
 * only ever offered/selected in the edit form (`ManagementPage`), never
 * reachable in the create form (which always starts at `DEFAULT_EXPIRATION`
 * and offers no "keep current" option, since there is nothing yet to
 * keep). See `TroveForm`'s `formMode` prop.
 */
export type ExpirationSelection = ExpirationCode | ''

export interface TroveFormValues {
  mode: TroveMode
  title: string
  description: string
  links: LinkEntry[]
  expiration: ExpirationSelection
  passwordEnabled: boolean
  password: string
}
