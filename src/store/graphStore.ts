// graphStore.ts — Zustand store for the node graph state

import { create } from 'zustand'
import { GSS_FORMAT_VERSION } from '../types/graph'
import { TICK_SPEC_VERSION } from '../core/TickEngine'
import { CommandManager } from '../core/CommandManager'
import { normalizeGraph } from '../core/GraphNormalizer'
import { getSettings } from './settingsStore'
import type { GSSGraph, GSSNode, GSSConnection } from '../types/graph'

interface GraphStore {
  graph: GSSGraph
  graphVersion: number   // increments whenever the whole graph is replaced (load, new, undo, redo)
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean

  /** Replaces the whole graph (load/template/import). Normalizes the input and resets undo history. */
  setGraph: (graph: GSSGraph) => void
  setNodes: (nodes: GSSNode[]) => void
  setConnections: (connections: GSSConnection[]) => void
  addNode: (node: GSSNode) => void
  removeNode: (id: string) => void
  /** `mergeKey`: consecutive edits with the same key (typing into one field) become one undo step. */
  updateNode: (id: string, data: Partial<GSSNode>, mergeKey?: string) => void
  addConnection: (conn: GSSConnection) => void
  /** Without `fromPort` removes every connection between the two nodes. */
  removeConnection: (fromNode: string, toNode: string, fromPort?: number) => void
  setName: (name: string) => void
  markClean: () => void
  newGraph: () => void
  undo: () => void
  redo: () => void
}

function makeDefaultGraph(): GSSGraph {
  const now = new Date().toISOString()
  return {
    version: GSS_FORMAT_VERSION,
    tick_spec_version: TICK_SPEC_VERSION,
    name: 'Untitled Economy',
    description: '',
    created_at: now,
    modified_at: now,
    // "Default seed" z nastavení (0 = při každém běhu náhodný seed)
    simulation_seed: Math.max(0, Math.floor(getSettings().defaultSeed || 0)),
    nodes: [],
    connections: [],
  }
}

const initialGraph = makeDefaultGraph()
// Výchozí stav musí být i v historii — jinak první undo po první úpravě nemělo kam se vrátit.
CommandManager.reset(initialGraph)

export const useGraphStore = create<GraphStore>((set) => {
  /** Applies a mutation, records it in the undo history and marks the graph dirty. */
  const mutate = (s: GraphStore, patch: Partial<GSSGraph>, mergeKey?: string): Partial<GraphStore> => {
    const g: GSSGraph = { ...s.graph, ...patch, modified_at: new Date().toISOString() }
    CommandManager.push(g, mergeKey)
    return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
  }

  return {
    graph: initialGraph,
    graphVersion: 0,
    isDirty: false,
    canUndo: false,
    canRedo: false,

    setGraph: (graph) => {
      const g = normalizeGraph(graph)
      CommandManager.reset(g)
      set((s) => ({ graph: g, graphVersion: s.graphVersion + 1, isDirty: false, canUndo: false, canRedo: false }))
    },

    setNodes: (nodes) => set((s) => mutate(s, { nodes })),

    setConnections: (connections) => set((s) => mutate(s, { connections })),

    addNode: (node) => set((s) => mutate(s, { nodes: [...s.graph.nodes, node] })),

    removeNode: (id) =>
      set((s) => mutate(s, {
        nodes: s.graph.nodes.filter((n) => n.id !== id),
        connections: s.graph.connections.filter((c) => c.from_node !== id && c.to_node !== id),
      })),

    updateNode: (id, data, mergeKey) =>
      set((s) => mutate(s, {
        nodes: s.graph.nodes.map((n) => (n.id === id ? { ...n, ...data } : n)),
      }, mergeKey)),

    addConnection: (conn) => set((s) => {
      // Duplicitní spojení (stejné uzly i port) by zdvojilo tok — ignorovat.
      const exists = s.graph.connections.some((c) =>
        c.from_node === conn.from_node && c.to_node === conn.to_node && c.from_port === conn.from_port)
      if (exists || conn.from_node === conn.to_node) return s
      return mutate(s, { connections: [...s.graph.connections, conn] })
    }),

    removeConnection: (fromNode, toNode, fromPort) =>
      set((s) => mutate(s, {
        connections: s.graph.connections.filter((c) =>
          !(c.from_node === fromNode && c.to_node === toNode && (fromPort === undefined || c.from_port === fromPort))),
      })),

    // Přejmenování je teď také krok historie (dřív ho undo "přeskočilo" a
    // obnovilo starý název z dřívějšího snapshotu).
    setName: (name) => set((s) => mutate(s, { name }, 'graph:name')),

    markClean: () => set({ isDirty: false }),

    newGraph: () => {
      const g = makeDefaultGraph()
      CommandManager.reset(g)
      set((s) => ({ graph: g, graphVersion: s.graphVersion + 1, isDirty: false, canUndo: false, canRedo: false }))
    },

    undo: () =>
      set((s) => {
        const g = CommandManager.undo()
        return g
          ? { graph: g, graphVersion: s.graphVersion + 1, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
          : s
      }),

    redo: () =>
      set((s) => {
        const g = CommandManager.redo()
        return g
          ? { graph: g, graphVersion: s.graphVersion + 1, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
          : s
      }),
  }
})
