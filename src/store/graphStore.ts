// graphStore.ts — Zustand store for the node graph state

import { create } from 'zustand'
import { GSS_FORMAT_VERSION } from '../types/graph'
import { TICK_SPEC_VERSION } from '../core/TickEngine'
import { CommandManager } from '../core/CommandManager'
import type { GSSGraph, GSSNode, GSSConnection } from '../types/graph'

interface GraphStore {
  graph: GSSGraph
  graphVersion: number   // increments on full graph replace (setGraph / newGraph)
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean

  setGraph: (graph: GSSGraph) => void
  setNodes: (nodes: GSSNode[]) => void
  setConnections: (connections: GSSConnection[]) => void
  addNode: (node: GSSNode) => void
  removeNode: (id: string) => void
  updateNode: (id: string, data: Partial<GSSNode>) => void
  addConnection: (conn: GSSConnection) => void
  removeConnection: (fromNode: string, toNode: string) => void
  setName: (name: string) => void
  markClean: () => void
  newGraph: () => void
  undo: () => void
  redo: () => void
}

const DEFAULT_GRAPH: GSSGraph = {
  version: GSS_FORMAT_VERSION,
  tick_spec_version: TICK_SPEC_VERSION,
  name: 'Untitled Economy',
  description: '',
  created_at: new Date().toISOString(),
  modified_at: new Date().toISOString(),
  simulation_seed: 42,
  nodes: [],
  connections: [],
}

export const useGraphStore = create<GraphStore>((set) => ({
  graph: { ...DEFAULT_GRAPH },
  graphVersion: 0,
  isDirty: false,
  canUndo: false,
  canRedo: false,

  setGraph: (graph) => {
    CommandManager.reset(graph)
    set((s) => ({ graph, graphVersion: s.graphVersion + 1, isDirty: false, canUndo: false, canRedo: false }))
  },

  setNodes: (nodes) =>
    set((s) => {
      const g = { ...s.graph, nodes, modified_at: new Date().toISOString() }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  setConnections: (connections) =>
    set((s) => {
      const g = { ...s.graph, connections, modified_at: new Date().toISOString() }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  addNode: (node) =>
    set((s) => {
      const g = { ...s.graph, nodes: [...s.graph.nodes, node], modified_at: new Date().toISOString() }
      CommandManager.push(g)
      return { graph: g, graphVersion: s.graphVersion + 1, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  removeNode: (id) =>
    set((s) => {
      const g = {
        ...s.graph,
        nodes: s.graph.nodes.filter((n) => n.id !== id),
        connections: s.graph.connections.filter((c) => c.from_node !== id && c.to_node !== id),
        modified_at: new Date().toISOString(),
      }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  updateNode: (id, data) =>
    set((s) => {
      const g = {
        ...s.graph,
        nodes: s.graph.nodes.map((n) => (n.id === id ? { ...n, ...data } : n)),
        modified_at: new Date().toISOString(),
      }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  addConnection: (conn) =>
    set((s) => {
      const g = { ...s.graph, connections: [...s.graph.connections, conn], modified_at: new Date().toISOString() }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  removeConnection: (fromNode, toNode) =>
    set((s) => {
      const g = {
        ...s.graph,
        connections: s.graph.connections.filter((c) => !(c.from_node === fromNode && c.to_node === toNode)),
        modified_at: new Date().toISOString(),
      }
      CommandManager.push(g)
      return { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() }
    }),

  setName: (name) =>
    set((s) => ({
      graph: { ...s.graph, name, modified_at: new Date().toISOString() },
      isDirty: true,
    })),

  markClean: () => set({ isDirty: false }),

  newGraph: () => {
    const g = { ...DEFAULT_GRAPH, created_at: new Date().toISOString(), modified_at: new Date().toISOString() }
    CommandManager.reset(g)
    set((s) => ({ graph: g, graphVersion: s.graphVersion + 1, isDirty: false, canUndo: false, canRedo: false }))
  },

  undo: () =>
    set((s) => {
      const g = CommandManager.undo()
      return g ? { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() } : s
    }),

  redo: () =>
    set((s) => {
      const g = CommandManager.redo()
      return g ? { graph: g, isDirty: true, canUndo: CommandManager.canUndo(), canRedo: CommandManager.canRedo() } : s
    }),
}))
