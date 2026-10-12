#!/usr/bin/env node
// scripts/check-version.cjs — fails if the app version differs between
// package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml and
// version.json (audit R-09). Runs in CI (`validate` job).
//
// package.json is the intended single source of truth for the app
// version (see src/core/version.ts). The other files need their own copy
// (OS-level installer metadata, Rust crate, update manifest), so this
// script is a consistency gate rather than a way to remove the duplication.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8')

const pkg = JSON.parse(read('package.json'))
const tauriConf = JSON.parse(read('src-tauri', 'tauri.conf.json'))
const cargoMatch = read('src-tauri', 'Cargo.toml').match(/^\s*version\s*=\s*"([^"]+)"/m)
const manifest = JSON.parse(read('version.json'))

const versions = {
  'package.json': pkg.version,
  'src-tauri/tauri.conf.json': tauriConf.version,
  'src-tauri/Cargo.toml': cargoMatch ? cargoMatch[1] : '(not found)',
  'version.json': manifest.version,
}

const mismatched = Object.entries(versions).filter(([, v]) => v !== pkg.version)
if (mismatched.length > 0) {
  console.error('Version mismatch — update all files to the same value before releasing:')
  for (const [file, v] of Object.entries(versions)) console.error(`  ${file}: "${v}"`)
  process.exit(1)
}

console.log(`Version OK: ${pkg.version}`)
