#!/usr/bin/env node
// scripts/generate-updater-manifests.cjs — builds latest-free.json and
// latest-pro.json for the Tauri updater from the signed assets of a GitHub
// release, and uploads them to that release.
//
// Why: tauri-action writes ONE `latest.json` per release. FREE and PRO
// builds upload to the same release, so they would overwrite each other's
// entries (a PRO install could "update" to the FREE build and vice versa),
// and the app's updater endpoints point at latest-free.json /
// latest-pro.json, which tauri-action never produces. CI therefore runs
// tauri-action with `uploadUpdaterJson: false` and calls this script once
// all builds have finished.
//
// PRO is now sold on itch.io and its installers are no longer attached to
// the GitHub Release, so normally only latest-free.json is produced (the
// "skipping latest-pro.json" warning is expected).
//
// Usage (CI, needs the `gh` CLI and GH_TOKEN):
//   node scripts/generate-updater-manifests.cjs <tag>
// Asset names follow the Tauri bundler: FREE = "GSS_…", PRO = "GSS-PRO_…".

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tag = process.argv[2] || process.env.GITHUB_REF_NAME
if (!tag) {
  console.error('Usage: generate-updater-manifests.cjs <tag>')
  process.exit(1)
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' })

const release = JSON.parse(gh('release', 'view', tag, '--json', 'assets,body'))
const assets = release.assets.map((a) => ({ name: a.name, url: a.url }))
const names = new Set(assets.map((a) => a.name))

const sigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-sigs-'))
gh('release', 'download', tag, '--pattern', '*.sig', '--dir', sigDir, '--clobber')

const version = tag.replace(/^v/, '')
const pubDate = new Date().toISOString()

// Tauri updater platform keys → how to recognise the updater bundle of that platform.
const PLATFORMS = [
  { key: 'windows-x86_64', match: (n) => /_x64-setup\.exe$/.test(n) },
  { key: 'linux-x86_64', match: (n) => /_amd64\.AppImage$/.test(n) },
  // macOS is built as one universal bundle ("…universal.app.tar.gz"), which
  // serves both architectures; per-architecture names are still recognised.
  { key: 'darwin-aarch64', match: (n) => /(aarch64|universal).*\.app\.tar\.gz$/.test(n) },
  { key: 'darwin-x86_64', match: (n) => /(x64|x86_64|universal).*\.app\.tar\.gz$/.test(n) },
]

function manifestFor(prefix) {
  const platforms = {}
  for (const p of PLATFORMS) {
    const asset = assets.find((a) => a.name.startsWith(prefix) && p.match(a.name))
    if (!asset || !names.has(`${asset.name}.sig`)) continue
    const signature = fs.readFileSync(path.join(sigDir, `${asset.name}.sig`), 'utf8').trim()
    platforms[p.key] = { signature, url: asset.url }
  }
  return { version, notes: release.body || '', pub_date: pubDate, platforms }
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-manifests-'))
const files = []
for (const [edition, prefix] of [['free', 'GSS_'], ['pro', 'GSS-PRO_']]) {
  const manifest = manifestFor(prefix)
  const count = Object.keys(manifest.platforms).length
  if (count === 0) {
    console.warn(`No signed ${edition.toUpperCase()} updater bundles found — skipping latest-${edition}.json`)
    continue
  }
  const file = path.join(outDir, `latest-${edition}.json`)
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  console.log(`latest-${edition}.json: ${Object.keys(manifest.platforms).join(', ')}`)
  files.push(file)
}

if (files.length === 0) {
  console.error('No updater manifests generated — were the bundles signed (TAURI_SIGNING_PRIVATE_KEY)?')
  process.exit(1)
}
gh('release', 'upload', tag, ...files, '--clobber')
