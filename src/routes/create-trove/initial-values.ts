import { DEFAULT_EXPIRATION } from './validation'
import type { TroveFormValues } from './types'

/**
 * Kept in its own module, not `TroveForm.tsx`, so that file exports only
 * the component (react-refresh/only-export-components — Fast Refresh
 * needs a component-only module to hot-reload correctly).
 */
export function createInitialValues(firstLinkId: string): TroveFormValues {
  return {
    mode: 'standard',
    title: '',
    description: '',
    links: [{ id: firstLinkId, url: '', label: '' }],
    expiration: DEFAULT_EXPIRATION,
    passwordEnabled: false,
    password: '',
  }
}
