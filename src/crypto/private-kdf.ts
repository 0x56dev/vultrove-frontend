import { argon2id } from 'hash-wasm'
import {
  KDF_V1_MEMORY_SIZE_KIB,
  KDF_V1_ITERATIONS,
  KDF_V1_PARALLELISM,
  KDF_V1_OUTPUT_LENGTH_BYTES,
} from './private-kdf-params'

export {
  KDF_V1_PARAMS_BYTES,
  KDF_V1_PARAMS_BASE64URL,
  isValidKdfParamsV1,
} from './private-kdf-params'

/**
 * Argon2id key-wrap KDF for password-protected Private Troves
 * (docs/PRIVATE_ENVELOPE.md §12–14, docs/THREAT_MODEL.md §10). **This
 * file — unlike `./private-kdf-params.ts` — is client-only and must
 * never be imported by `src/server/http`, `src/server/application`, or
 * `src/server/storage`.** The server never invokes Argon2 for Private
 * mode and never receives a Private password or the fragment-secret-
 * as-salt; importing this file at all would pull `hash-wasm` (a WASM
 * Argon2id implementation) into the Node server process for a
 * capability it must never use. Structural validation that only needs
 * to *compare* `kdf.params` (never run Argon2id) lives in
 * `./private-kdf-params.ts` instead, specifically so it can be safely
 * imported by both the browser and the server.
 *
 * Uses `hash-wasm`'s `argon2id()` (pinned to exactly 4.12.0 in
 * `package.json` — never a caret range for this dependency), a from-
 * scratch WASM/TypeScript reimplementation of the Argon2 spec rather
 * than a compiled build of the P-H-C reference C implementation. This
 * is a deliberate, documented tradeoff, not an oversight: no browser
 * ships a native Argon2 API, so *some* WASM implementation is required,
 * and hash-wasm was chosen after ruling out libsodium-wrappers (its
 * public API hard-codes a 16-byte Argon2id salt and never exposes
 * parallelism — incompatible with this construction's 32-byte
 * fragment-secret-as-salt design, confirmed against libsodium's own C
 * headers) and argon2-browser (unmaintained, no release since 2021).
 * Before adoption, hash-wasm's raw Argon2id output was verified
 * byte-for-byte against the Node `argon2` package (a binding to the
 * actual P-H-C reference implementation, already used for Standard
 * Trove passwords) across multiple parameter sets, including this exact
 * kdfVersion:1 profile. `private-kdf.test.ts`'s "cross-implementation"
 * suite keeps that comparison running as ongoing regression evidence —
 * being an independent reimplementation, rather than a wrapped
 * reference build, is the one property no amount of re-running that
 * suite removes, and is recorded here rather than left implicit.
 */

/**
 * Derives the 32-byte key-encryption key for `kdfVersion: 1`, from the
 * password and the fragment-secret-as-salt (docs/PRIVATE_ENVELOPE.md
 * §12). Always uses the hard-coded trusted parameters from
 * `./private-kdf-params.ts`; the caller is responsible for having
 * already verified a presented envelope's `kdf.id`/`kdf.kdfVersion`/
 * `kdf.params` (via `isValidKdfParamsV1` and a `kdfVersion === 1` check)
 * *before* ever calling this — this function itself has no
 * `kdf.params` parameter at all, structurally preventing an untrusted
 * value from reaching Argon2id here.
 */
export async function deriveKekV1(
  password: string,
  fragmentSecretSalt: Uint8Array,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt: fragmentSecretSalt,
    iterations: KDF_V1_ITERATIONS,
    parallelism: KDF_V1_PARALLELISM,
    memorySize: KDF_V1_MEMORY_SIZE_KIB,
    hashLength: KDF_V1_OUTPUT_LENGTH_BYTES,
    outputType: 'binary',
  })
}
