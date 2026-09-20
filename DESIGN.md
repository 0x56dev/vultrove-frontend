# Ephemeral machine visual system

Based on main at `5562991`. The TypeSafe screenshots inform contrast, texture, and typographic taste only; no reference assets, layouts, branding, or page compositions are reused.

## Presentation

The existing palette remains exact: purple `#a48cf2`, green `#7fd9ab`, dark ground `#131019`. Large editorial sans-serif type contrasts with small monospace annotations. Hard borders, square corners, crop marks, bilateral raster texture, and a bounded wireframe specimen replace rounded presentation. Mobile stacks the copy before the artwork so the creation link is encountered first. Required controls never move.

The logo remains recognizable and unchanged. A separate procedural sigil, raster field, line structures, glyphs, and folded bilateral wireframe share a cosmetic identity. Creation now groups the existing controls into an instrument composition. Public view, success, error, and management screens retain their original components and interactions.

## Cosmetic isolation

`src/visual/identity.ts` uses a new 128-bit `crypto.getRandomValues` seed and a deterministic sfc32 PRNG. This PRNG is for artwork only, never security. The identity store initializes once per loaded document; route remounts and resizing retain it. Explicit reroll replaces it. Reloading creates a fresh identity.

The visual modules accept no application data and import no API, routing, encryption, or telemetry modules. They do not read URLs, secrets, uploads, device identifiers, or storage and do not persist or transmit the seed. No new dependencies, external fonts, images, or network calls are introduced.

## Interaction

Only the bounded wireframe surface captures drag gestures (`touch-action: none`); the rest of the page scrolls normally. Pointer capture supports release outside the surface, re-grabbing, and cancellation. Recent pointer movement estimates angular velocity, capped at 8 radians/second, with exponential friction after release. An idle rotation is separate from momentum. Arrow keys rotate; Home resets. A pause button stops autonomous motion. Reduced-motion and hidden-document states stop the animation loop; deliberate rotation still works with reduced motion.

## Scope and validation

This public repository implements link troves, not Quick Drop/file transfer. No upload, download-limit, transfer-progress, or file-selection flow exists here. Integrating the visual system into that separate implementation requires its actual source.

API, cryptography, telemetry, creation, password, expiration, sharing, management, and deletion logic are unchanged. Existing regression coverage is retained, with additional tests for deterministic artwork, bounded geometry, URL/storage independence, and identity stability across rerenders and remounts.

Validated: 353 tests across 29 test files, ESLint, and production build. Chromium checks cover desktop, 390 px and 320 px layouts, form input/mode switching, real protocol-dispatched touch gestures, keyboard rotation, reduced motion, reroll, identity stability during navigation, flick/re-grab, pause, and absence of browser errors. Screenshots in `docs/previews/` show one random visit, not a fixed template. A live backend was not available; backend-dependent flows are covered by the existing mocked regression suite.

## Creation instrument revision

The first create screen failed compositionally: the generic 40-rem column flattened hierarchy, put type selection ahead of content, nested link rows inside a fieldset box, and left expiration and submission as trailing form fields. Matching colors and corners did not reproduce the homepage's spatial language.

The revised page uses a wide content/link work area, a smaller offset draft summary, and separate privacy/expiration areas. Content uses editorial-scale input typography and open space; Links uses a purple working header and numbered rows without nested boxes; Privacy presents two explanatory choices; Expiration uses a compact duration selector; Creation gives the submission action its own concluding area. On mobile the order is Content, Links, Privacy, Expiration, draft summary, Creation, with natural scrolling and keyboard order.

The summary derives title, link-slot count, mode, password-enabled state, and expiration from existing form state. It receives neither URL values nor passwords, makes no network calls, and never persists anything. It labels itself as a draft, not proof of successful creation or encryption. The procedural field and sigil use the existing visit identity and receive no form props; the artwork is explicitly labeled cosmetic.

Every original control, field limit, validation rule, touched/error behavior, radio/checkbox/select behavior, edit-mode sentinel, and submission callback remains intact. The implementation rearranges the existing JSX controls; all state handlers and cryptography/API/telemetry code are unchanged. Edit mode retains its previous layout.

Revision validation: 355 tests across 30 files, lint, production build, and Chromium rendering at 320, 390, 768, 900, and 1440 px. Browser checks include natural keyboard order, long-title wrapping, live summary updates, cosmetic independence, and validation errors. Unit coverage verifies the same field nodes survive mode changes, summary exclusion of URLs/passwords, and the original submission payload. No live backend was available.
