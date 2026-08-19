// FolderExporter.ts — port GDScript FolderExporter.gd
// Export/import grafového projektu jako sada JSON souborů (v prohlížeči jako stažitelné soubory).
// Struktura:
//   manifest.json      — metadata, verze, seed
//   nodes.json         — seřazené uzly
//   connections.json   — seřazená spojení
//   scenarios.json     — scénáře (volitelně)
//   personas.json      — persony (volitelně)

import type { GSSGraph } from '../types/graph'
import { TICK_SPEC_VERSION } from './TickEngine'
import { stringify } from './DeterministicJSON'

export interface FolderManifest {
  gss_version: string
  tick_spec_version: number
  simulation_seed: number
  exported: string
  node_count: number
  connection_count: number
}

export interface FolderExportResult {
  'manifest.json': string
  'nodes.json': string
  'connections.json': string
  'scenarios.json'?: string
  'personas.json'?: string
}

// ==================== EXPORT ====================

export function exportFolder(graph: GSSGraph): FolderExportResult {
  const manifest: FolderManifest = {
    gss_version: '3.0',
    tick_spec_version: graph.tick_spec_version ?? TICK_SPEC_VERSION,
    simulation_seed: graph.simulation_seed ?? 0,
    exported: new Date().toISOString(),
    node_count: graph.nodes.length,
    connection_count: graph.connections.length,
  }

  const sortedNodes = [...graph.nodes].sort((a, b) =>
    String(a.id) < String(b.id) ? -1 : 1,
  )

  const sortedConns = [...graph.connections].sort((a, b) => {
    const ka = `${a.from_node}:${a.from_port}:${a.to_node}:${a.to_port}`
    const kb = `${b.from_node}:${b.from_port}:${b.to_node}:${b.to_port}`
    return ka < kb ? -1 : 1
  })

  const result: FolderExportResult = {
    'manifest.json':    stringify(manifest),
    'nodes.json':       stringify(sortedNodes),
    'connections.json': stringify(sortedConns),
  }

  const scenarios = (graph as unknown as Record<string, unknown>)['scenarios']
  if (Array.isArray(scenarios) && scenarios.length > 0) {
    const sorted = [...scenarios as unknown[]].sort((a, b) =>
      String((a as Record<string, unknown>)['name'] ?? '') < String((b as Record<string, unknown>)['name'] ?? '') ? -1 : 1,
    )
    result['scenarios.json'] = stringify(sorted)
  }

  const personas = (graph as unknown as Record<string, unknown>)['personas']
  if (Array.isArray(personas) && personas.length > 0) {
    const sorted = [...personas as unknown[]].sort((a, b) =>
      String((a as Record<string, unknown>)['name'] ?? '') < String((b as Record<string, unknown>)['name'] ?? '') ? -1 : 1,
    )
    result['personas.json'] = stringify(sorted)
  }

  return result
}

// ==================== IMPORT ====================

export function importFolder(files: Record<string, string>): GSSGraph | { error: string } {
  const manifestJson = files['manifest.json']
  if (!manifestJson) return { error: 'manifest.json nenalezen' }

  const nodesJson = files['nodes.json']
  if (!nodesJson) return { error: 'nodes.json nenalezen' }

  const connsJson = files['connections.json']
  if (!connsJson) return { error: 'connections.json nenalezen' }

  try {
    const manifest = JSON.parse(manifestJson) as FolderManifest
    const nodes    = JSON.parse(nodesJson)    as GSSGraph['nodes']
    const conns    = JSON.parse(connsJson)    as GSSGraph['connections']

    const scenarios = files['scenarios.json'] ? JSON.parse(files['scenarios.json']) as unknown : []
    const personas  = files['personas.json']  ? JSON.parse(files['personas.json'])  as unknown : []

    const now = new Date().toISOString()
    return {
      version: '3.0',
      tick_spec_version: manifest.tick_spec_version ?? TICK_SPEC_VERSION,
      name: 'Imported Project',
      description: '',
      created_at: now,
      modified_at: now,
      simulation_seed: manifest.simulation_seed ?? 0,
      nodes,
      connections: conns,
      scenarios: scenarios as GSSGraph['scenarios'],
      personas: personas as GSSGraph['personas'],
    } satisfies GSSGraph
  } catch (e) {
    return { error: `Chyba při parsování: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ==================== BROWSER DOWNLOAD HELPER ====================

/** Stáhne jednolivý soubor z export výsledku jako blob */
export function downloadExportFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Stáhne všechny soubory z FolderExportResult jeden po druhém */
export function downloadAllExportFiles(result: FolderExportResult, projectName = 'gss_project'): void {
  for (const [filename, content] of Object.entries(result)) {
    if (content) downloadExportFile(`${projectName}_${filename}`, content)
  }
}
