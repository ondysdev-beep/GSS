#!/usr/bin/env node
// scripts/check-version.cjs — fails if package.json and
// src-tauri/tauri.conf.json disagree on version (audit R-09).
//
// package.json is the intended single source of truth for the app
// version (see src/core/version.ts). tauri.conf.json needs its own copy
// for the OS-level installer metadata, so this script is a consistency
// gate rather than a way to remove the duplication entirely.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))

if (pkg.version !== tauriConf.version) {
  console.error(
    `Version mismatch: package.json is "${pkg.version}" but ` +
    `src-tauri/tauri.conf.json is "${tauriConf.version}". ` +
    `Update both to the same value before releasing.`
  )
  process.exit(1)
}

console.log(`Version OK: ${pkg.version}`)
