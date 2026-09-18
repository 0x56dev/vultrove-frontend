import { apiRequest } from './client'

/**
 * The only client-submittable telemetry event for V1 (backend's
 * `docs/TELEMETRY.md`) — a strict allowlist, not a freeform string. The
 * server rejects any other value and any body shape beyond
 * `{ event: ClientTelemetryEvent }`, so this type is not merely
 * documentation, it's the entire vocabulary this app is allowed to submit.
 */
export type ClientTelemetryEvent = 'create_submit_clicked'

/**
 * Records one aggregate telemetry event (docs/TELEMETRY.md). No trove ID,
 * URL, referrer, session/user ID, timestamp, user agent, fingerprint, or
 * any other metadata is ever sent — only this fixed event name. The
 * server supplies the date/time and folds this into a daily aggregate
 * counter; no per-visitor record is created and nothing is returned that
 * could serve as a tracking identifier.
 *
 * This function does not swallow its own failure — it's a plain API call
 * like any other in this module family. Every current caller treats it as
 * best-effort and is responsible for its own `.catch()` (see
 * `CreateTrovePage.tsx`): a telemetry failure must never surface to the
 * user or change the outcome of the product action it accompanies.
 */
export function sendTelemetryEvent(event: ClientTelemetryEvent): Promise<void> {
  return apiRequest({
    method: 'POST',
    path: '/api/v1/telemetry/events',
    body: { event },
  })
}
