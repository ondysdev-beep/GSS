// sdk/example.ts — spustitelný příklad, jak použít GSS simulační jádro
// MIMO desktopovou aplikaci (Node.js CLI, CI pipeline, build skript
// jiného enginu…). Používá výhradně `src/core/sdk.ts`, žádný React/Tauri
// kód. Spustit: `npm run sdk:example -- cesta/ke/grafu.gss`
//
// Toto je ukázkový skript, ne publikovaný npm balíček — viz sdk/README.md
// pro to, co by bylo potřeba udělat pro reálnou publikaci na npm (mimo
// rozsah této session — vyžaduje npm účet vlastníka projektu).

import { readFileSync } from 'node:fs'
import {
  validate, hasErrors, formatIssue,
  initState, simulateTick, createRNG,
  type GSSGraph,
} from '../src/core/sdk'

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: npm run sdk:example -- path/to/graph.gss [ticks] [dt] [seed]')
    process.exit(1)
  }

  const ticks = Number(process.argv[3] ?? 60)
  const dt = Number(process.argv[4] ?? 1.0)
  const seed = Number(process.argv[5] ?? 42)

  // Oprava B4: číselné argumenty a čtení/parsování souboru dřív nebyly
  // ošetřené vůbec — běžná chyba (překlep v cestě, poškozený JSON, špatně
  // zadané číslo) skončila syrovým Node stack trace místo srozumitelné
  // hlášky. Tohle je první věc, kterou uvidí kdokoli, kdo si SDK podle
  // README vyzkouší — stojí za to, aby to bylo použitelné i na první dobrou.
  if (!Number.isFinite(ticks) || ticks <= 0) {
    console.error(`Invalid "ticks" value: "${process.argv[3]}" (must be a positive number).`)
    process.exit(1)
  }
  if (!Number.isFinite(dt) || dt <= 0) {
    console.error(`Invalid "dt" value: "${process.argv[4]}" (must be a positive number).`)
    process.exit(1)
  }
  if (!Number.isFinite(seed)) {
    console.error(`Invalid "seed" value: "${process.argv[5]}" (must be a number).`)
    process.exit(1)
  }

  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    console.error(`Failed to read file "${path}": ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  let graph: GSSGraph
  try {
    graph = JSON.parse(raw) as GSSGraph
  } catch (err) {
    console.error(`File "${path}" does not contain valid JSON: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes)) {
    console.error(`File "${path}" does not match the GSS graph structure (missing "nodes").`)
    process.exit(1)
  }

  const issues = validate(graph)
  if (hasErrors(issues)) {
    console.error(`The graph has errors, simulation will not run:`)
    for (const issue of issues) console.error(' - ' + formatIssue(issue))
    process.exit(1)
  }

  const rng = createRNG(seed)
  let state = initState(graph)
  for (let i = 0; i < ticks; i++) {
    state = simulateTick(state, graph, dt, rng)
  }

  console.log(JSON.stringify({
    graph: graph.name,
    ticks,
    dt,
    seed,
    final_pools: Object.fromEntries(
      Object.entries(state.pools).map(([id, p]) => [id, { resource: p.resource, amount: p.amount }]),
    ),
  }, null, 2))
}

main()
