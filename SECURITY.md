# Security notes

## Historical incident: exposed itch.io API key + customer download keys

During the pre-release audit, two problems were found in this repository:

1. `src-tauri/src/commands/license.rs` contained a hardcoded itch.io API key
   directly in source code.
2. Two files in the repository root (`gss.txt`, `gss (1).txt`) contained what
   appear to be real itch.io download/license key URLs.

### What was fixed at the time (superseded — see "Current architecture" below)

The API key was first moved out of source into a `GSS_ITCHIO_API_KEY`
compile-time environment variable, and `gss.txt`/`gss (1).txt` were
deleted with `.gitignore` rules added to prevent recurrence. That
mitigation is now moot: **the entire itch.io API integration and runtime
license-key system have since been removed** (see below) — there is no
longer any itch.io API key anywhere in this codebase, compiled or
otherwise, so there is nothing left to leak through this particular
mechanism.

### What still requires manual action outside this codebase

This environment has no access to your itch.io account or GitHub
repository, so the following **cannot be done automatically** and must be
done by you if not already handled:

1. **Revoke the originally-exposed itch.io API key** at
   `https://itch.io/user/settings/api-keys`, if you haven't already. It
   must be treated as compromised regardless of it no longer being used by
   this codebase, because it may still exist in old Git commits/GitHub.
2. **Rewrite Git history** to remove the old key and the `gss.txt` /
   `gss (1).txt` files from all previous commits (e.g. `git filter-repo` or
   BFG Repo-Cleaner), then force-push, if this repository has ever been
   pushed publicly. Deleting the files in a new commit does **not** remove
   them from history.
3. **Rotate/invalidate any download keys** found in the removed `gss.txt` /
   `gss (1).txt` files if there is any chance they were exposed publicly.
4. You can now **remove any `GSS_ITCHIO_API_KEY` GitHub Actions secret**
   you may have set previously — it is no longer read by anything.

## Current architecture: no itch.io API calls, no runtime license key

GSS used to call the itch.io API directly from the desktop client to
validate a user-entered download key, which required embedding a
privileged API key in every binary — a real, documented limitation (a
client secret in a shipped binary is never fully secret). That whole
mechanism has been **removed**, not just hardened:

- `src-tauri/src/commands/license.rs` now contains only
  `get_build_variant()`, which returns `"pro"` or `"free"` based on the
  `pro` Cargo feature flag the binary was compiled with — no network
  calls, no stored credentials, no API key of any kind.
- There is no `validate_license_key`/`deactivate_license` command
  anymore, and no key-entry UI anywhere in the app (`LicensePanel.tsx`,
  `SettingsModal.tsx`).
- `licenseStore.ts` is **no longer persisted to `localStorage`**. Previously
  it was (`gss_license_v2`), which meant a user could set `isPro: true`
  directly in devtools and it would survive restarts. Now `isPro` is
  re-derived from `platform.getBuildVariant()` fresh on every launch, so
  there is no stored trust state to tamper with — editing it in devtools
  only lasts until the next reload.

## PRO/FREE gating — now a single, real mechanism

There used to be two parallel PRO mechanisms: a genuinely secure
compile-time build flag, and a runtime key-unlock path that was
**verified to be a UI convenience gate, not a security boundary** (any
user with devtools could set `isPro: true` in `localStorage` and unlock
every `ProGate`-wrapped feature with no key, no network call). That
second path has been deleted entirely rather than patched, because any
client-side countermeasure would still just be JavaScript a determined
user controls — adding more client-side checks would have been security
theater, not a fix.

**What remains is only the mechanism that was already real:**
Compile-time PRO builds (`cargo build --features pro`, wired into
`.github/workflows/ci.yml`'s build matrix, same pattern for the web
version via `VITE_EDITION`). `get_build_variant()` reflects what the
binary/bundle was actually compiled as — this is enforced by the
compiler/bundler, not bypassable from the WebView/JS side, and there is
no longer a second, weaker path sitting next to it. FREE and PRO are
simply separate downloads/deployments now, same as most desktop software
that offers a paid tier without an online activation server.

## Content Security Policy (R-04)

`src-tauri/tauri.conf.json` previously shipped with `"csp": null`, which
disables Tauri's CSP entirely — meaning any injected script (e.g. via a
future "import untrusted .gss file" or "shared community template" feature)
would have unrestricted access to the Tauri IPC bridge, not just the page.

The new CSP was derived from what GSS actually loads, not copied from a
generic template:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self'; img-src 'self' data: asset: https://asset.localhost;
connect-src 'self' https: ipc: http://ipc.localhost
```

- `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`) is the important
  line: it blocks arbitrary injected script from running or reaching the
  Tauri IPC bridge, which is the actual attack this CSP defends against.
- `style-src 'self' 'unsafe-inline'` — Tailwind and the charting libraries
  (Recharts, ReactFlow) set inline `style` attributes at runtime; this
  cannot be removed without a broader UI library change that is out of
  scope here. Inline *styles* cannot execute code, so this is a low-risk
  allowance compared to inline scripts.
- `font-src 'self'` / no external font origins — fonts are now self-hosted
  (R-15), so `fonts.googleapis.com`/`fonts.gstatic.com` are no longer
  needed and are not allowed.
- `img-src ... data: asset: https://asset.localhost` — `asset:` /
  `https://asset.localhost` is Tauri's own asset protocol; `data:` covers
  any inline SVG/base64 rendering from chart libraries.
- `connect-src 'self' https: ipc: http://ipc.localhost` — `ipc:` /
  `http://ipc.localhost` is required for Tauri's `invoke()` calls to reach
  Rust commands. The `https:` allowance is needed because
  `UpdateChecker.ts` fetches an **admin-configured** manifest URL
  (`VITE_VERSION_MANIFEST_URL`) whose exact host isn't fixed at build time.
  This is the one deliberately broad rule in this policy — it was not
  possible to narrow it further without hardcoding a specific host, which
  would break if the manifest URL is ever moved to a different service.

This was checked against `npm run build` (production build succeeds) but
**was not verified at runtime inside an actual Tauri window**, since this
environment cannot run the Rust/Tauri toolchain. Please do a manual smoke
test after this change: open the app, confirm fonts render, confirm the
license/PRO gate still works, confirm graph save/load/export still work,
and check the browser devtools console for CSP violation warnings.

## Auto-update signing key

GSS auto-updates itself (Tauri updater plugin) — see
`src/platform/tauri.ts` (`checkForAppUpdate`/`installAppUpdate`) and
`src/components/ui/UpdateBanner.tsx`. This required generating a new
signing keypair (`npx tauri signer generate`), separate from anything
discussed earlier in this document.

**Why a signature is required at all:** without one, anything served from
the update endpoint URL would be installed and run with full desktop
permissions — the signature is what lets the app verify an update
actually came from you, not from anyone who managed to serve a response
at that URL (e.g. a compromised CDN, a DNS issue, or a malicious release
uploaded by someone else with repo write access).

**What's public vs. private:**
- The **public key** is embedded in `src-tauri/tauri.conf.json`
  (`plugins.updater.pubkey`) — this is meant to be committed, it's how the
  app verifies signatures, it grants no ability to create new ones.
- The **private key** was generated with an **empty password**
  (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is intentionally set to an empty
  secret, not omitted) — this is the standard, documented approach for
  CI-only signing: GitHub Actions Secrets already encrypt it at rest, and
  an interactive password would block unattended CI builds. It was never
  written to any file in this repository — it exists only in GitHub
  Actions Secrets (`TAURI_SIGNING_PRIVATE_KEY`) and was handed to you
  directly once, outside the codebase, to store there.

**If you ever suspect the private key leaked** (e.g. accidentally
committed, pasted somewhere public): generate a new keypair
(`npx tauri signer generate`), replace the `pubkey` value in
`tauri.conf.json`, and replace the `TAURI_SIGNING_PRIVATE_KEY` GitHub
secret. Old installs won't be able to verify new updates signed with a
different key until they're manually reinstalled once — this is expected,
not a bug, and is exactly the protection the signature exists to provide.

**Not verified:** the actual CI signing + `latest-free.json`/
`latest-pro.json` manifest generation (`tauri-action`'s
`createUpdaterArtifacts` handling) was implemented according to Tauri v2's
documented behavior but **could not be run end-to-end** in this
environment (no Cargo/GitHub Actions execution available here). Please
verify on the first real tagged release that both manifest files appear
as release assets and that a FREE/PRO install of the previous version
actually detects and installs the new one.

