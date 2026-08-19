#!/usr/bin/env node
// scripts/combine-web-builds.cjs — Fáze 6 webové verze.
//
// Cloudflare Pages/Vercel/GitHub Pages nasazují VŽDY jednu složku jako
// kořen webu. Aby FREE a PRO běžely na stejné doméně (nutné kvůli
// sdílenému localStorage pro AI klíč — viz platform/web.ts), musí být
// oba buildy sloučené do jedné struktury:
//
//   dist-web-site/
//     index.html, assets/...     ← FREE (kořen domény)
//     pro/index.html, pro/assets/... ← PRO (podcesta /pro)
//
// Spouští se automaticky po `npm run build:web` (viz "build:web:site" skript).

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const FREE_DIR = path.join(ROOT, 'dist-web', 'free')
const PRO_DIR = path.join(ROOT, 'dist-web', 'pro')
const OUT_DIR = path.join(ROOT, 'dist-web-site')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function assertBuildExists(dir, label) {
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`Chybí build "${label}" v ${dir} — spusť nejdřív "npm run build:web".`)
    process.exit(1)
  }
}

assertBuildExists(FREE_DIR, 'free')
assertBuildExists(PRO_DIR, 'pro')

fs.rmSync(OUT_DIR, { recursive: true, force: true })
copyDir(FREE_DIR, OUT_DIR)
copyDir(PRO_DIR, path.join(OUT_DIR, 'pro'))

console.log(`Hotovo: ${OUT_DIR}`)
console.log(`  /      → FREE (${FREE_DIR})`)
console.log(`  /pro/  → PRO  (${PRO_DIR})`)
console.log('Tuhle složku (dist-web-site/) nahraj na Cloudflare Pages/Vercel/GitHub Pages jako celek.')
