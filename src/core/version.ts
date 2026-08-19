// version.ts — single source of truth for the app version shown in the UI
// and used by the update checker.
//
// Rationale (audit R-09): the version previously existed as separate
// hardcoded strings in package.json, tauri.conf.json, and a literal
// '3.2.0' inside UpdateChecker.ts, which could silently drift out of sync.
//
// package.json is the canonical source (it's what `npm version` bumps).
// Everything the frontend displays or compares against reads from here.
//
// NOTE: src-tauri/tauri.conf.json still has its own `version` field — this
// is a real constraint of Tauri (the OS-level installer metadata is read
// from that file at build time by the Rust/Cargo toolchain, not from
// package.json), so it cannot be fully eliminated without adding new build
// tooling. Instead, CI (.github/workflows/ci.yml, `validate` job) fails the
// build if package.json and tauri.conf.json versions disagree — see
// `npm run check:version`. This keeps a single source of truth in intent
// (package.json) with an enforced consistency check rather than a second
// silently-diverging copy.
import packageJson from '../../package.json'

export const APP_VERSION: string = packageJson.version
