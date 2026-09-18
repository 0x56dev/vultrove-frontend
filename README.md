# Vultrove Frontend

Vultrove is a privacy-focused web service I am independently developing and operating.

This repository contains the public browser-facing frontend/client application. The production backend, deployment configuration, infrastructure, and security-sensitive components are maintained separately and are intentionally not included here.

## What this is

A React + TypeScript + Vite single-page app. It talks to the Vultrove backend over a same-origin `/api/*` HTTP API (no cross-origin requests, no third-party analytics or CDN origins).

Currently implemented functionality:

- **Create a trove** — bundle a set of links (with optional labels), an optional title/description, and an optional expiration into a shareable "trove."
- **Standard troves** — an optionally password-protected trove where the password is verified server-side.
- **Private troves** — an end-to-end-encrypted trove: the content is encrypted entirely in the browser (Web Crypto + an Argon2id WASM implementation for password-based key derivation) before it ever leaves the client. The decryption key lives only in the URL fragment, which browsers never send to a server.
- **View a trove** — a public read view for a shared trove link, including client-side decryption for private troves.
- **Manage a trove** — edit or delete a trove using its management link/secret.
- **Privacy-friendly telemetry** — submitting the Create Trove form sends one best-effort, first-party `create_submit_clicked` event (see the in-app "Privacy-friendly telemetry" footer link / `/privacy-telemetry`). No cookies, no persistent visitor ID, no fingerprinting, no third-party analytics — see `src/api/telemetry.ts`.

Client-side cryptography (id generation, the private-trove envelope format, the fragment-secret encoding, and the Argon2id key-derivation wrapper) lives under `src/crypto/`. Everything there is designed to run entirely in the browser and ships in the browser bundle.

## Local development

```sh
npm install
npm run dev
```

The dev server proxies `/api/*` requests to a backend at `http://127.0.0.1:8080` by default (see `vite.dev-proxy.ts`). If you're running this frontend against a backend on a different port, override it:

```sh
export VULTROVE_DEV_API_TARGET="http://127.0.0.1:8081"
npm run dev
```

This repository doesn't include a backend, so `npm run dev` alone will show working UI but API calls will fail unless you have a compatible backend running separately. No `.env` file is required or used by this frontend — there are no browser-exposed environment variables (`import.meta.env.VITE_*`) in this codebase by design; the app only ever makes same-origin, relative API requests.

## Checks

```sh
npm run typecheck
npm run lint
npm run format        # check formatting
npm run format:write  # apply formatting
npm test               # unit test suite
npm run build           # production build
```

## Security & privacy

- No production credentials, secrets, API keys, or security-sensitive configuration are stored in this repository.
- The backend, deployment configuration, and infrastructure code are maintained in a separate, private repository.
- Where applicable, the app is designed with privacy and data minimization in mind — for example, Private-trove content is encrypted client-side, and the decryption secret is carried only in the URL fragment rather than sent to any server.

I personally administer the production infrastructure for this project, including the VPS, reverse proxy, application services, database, TLS configuration, backups, and security controls. Implementation details of that production environment are deliberately not published here.

## License

Not yet decided. No license is currently granted; all rights reserved unless/until this is revisited.
