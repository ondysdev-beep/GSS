// GraphModule.ts — port GDScript GraphModule.gd
// Znovupoužitelné subgraph moduly: vytvoření ze selekce, uložení/načtení, vložení do grafu.

import type { GSSGraph, GSSNode, GSSConnection } from '../types/graph'

export interface ModulePort {
  node_id: string
  port: number
  external_node: string
  external_port: number
}

export interface GraphModuleData {
  module_name: string
  description: string
  created: string
  nodes: GSSNode[]
  connections: GSSConnection[]
  input_ports: ModulePort[]
  output_ports: ModulePort[]
}

export interface InsertResult {
  new_nodes: GSSNode[]
  new_connections: GSSConnection[]
  id_map: Record<string, string>   // old_id → new_id
  input_ports: ModulePort[]
  output_ports: ModulePort[]
}

// ==================== VYTVOŘIT MODUL ZE SELEKCE ====================

export function createFromSelection(
  selectedIds: string[],
  graph: GSSGraph,
  moduleName = '',
  description = '',
): GraphModuleData | { error: string } {
  if (selectedIds.length === 0) return { error: 'No nodes selected' }

  const selectedSet = new Set(selectedIds.map(String))

  const moduleNodes = graph.nodes
    .filter((n) => selectedSet.has(String(n.id)))
    .map((n) => JSON.parse(JSON.stringify(n)) as GSSNode)

  if (moduleNodes.length === 0) return { error: 'No matching nodes found in graph data' }

  const internalConns: GSSConnection[] = []
  const inputPorts: ModulePort[] = []
  const outputPorts: ModulePort[] = []

  for (const conn of graph.connections) {
    const fromId = String(conn.from_node)
    const toId   = String(conn.to_node)
    const fromIn = selectedSet.has(fromId)
    const toIn   = selectedSet.has(toId)

    if (fromIn && toIn) {
      internalConns.push({ ...conn })
    } else if (!fromIn && toIn) {
      inputPorts.push({ node_id: toId, port: conn.to_port, external_node: fromId, external_port: conn.from_port })
    } else if (fromIn && !toIn) {
      outputPorts.push({ node_id: fromId, port: conn.from_port, external_node: toId, external_port: conn.to_port })
    }
  }

  // Normalizovat pozice: top-left uzel na (0,0)
  let minX = Infinity
  let minY = Infinity
  for (const node of moduleNodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
  }
  for (const node of moduleNodes) {
    node.position = { x: node.position.x - minX, y: node.position.y - minY }
  }

  const autoName = moduleName || `Module_${Date.now()}`

  return {
    module_name: autoName,
    description,
    created: new Date().toISOString(),
    nodes: moduleNodes,
    connections: internalConns,
    input_ports: inputPorts,
    output_ports: outputPorts,
  }
}

// ==================== VLOŽIT MODUL DO GRAFU ====================

export function insertModule(
  module: GraphModuleData,
  graph: GSSGraph,
  offsetX = 0,
  offsetY = 0,
  idPrefix = '',
): InsertResult {
  const existingIds = new Set(graph.nodes.map((n) => String(n.id)))
  const prefix = idPrefix || `m${Date.now()}_`
  const idMap: Record<string, string> = {}

  const newNodes: GSSNode[] = []

  for (const node of module.nodes) {
    const oldId = String(node.id)
    let newId = prefix + oldId
    let counter = 0
    while (existingIds.has(newId)) {
      counter++
      newId = `${prefix}${oldId}_${counter}`
    }
    idMap[oldId] = newId
    existingIds.add(newId)

    const newNode = JSON.parse(JSON.stringify(node)) as GSSNode
    newNode.id = newId
    newNode.position = { x: newNode.position.x + offsetX, y: newNode.position.y + offsetY }
    newNodes.push(newNode)
  }

  // Přemapovat interní spojení
  const newConns: GSSConnection[] = module.connections.map((conn) => ({
    ...conn,
    from_node: idMap[String(conn.from_node)] ?? String(conn.from_node),
    to_node:   idMap[String(conn.to_node)]   ?? String(conn.to_node),
  }))

  return {
    new_nodes: newNodes,
    new_connections: newConns,
    id_map: idMap,
    input_ports:  module.input_ports,
    output_ports: module.output_ports,
  }
}

// ==================== SERIALIZACE ====================

export function moduleToJSON(module: GraphModuleData): string {
  return JSON.stringify(module, null, '\t')
}

export function moduleFromJSON(json: string): GraphModuleData | { error: string } {
  try {
    return JSON.parse(json) as GraphModuleData
  } catch {
    return { error: 'Invalid module JSON' }
  }
}
