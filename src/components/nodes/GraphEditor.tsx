// GraphEditor.tsx — ReactFlow canvas wired to graphStore
// Handles: node drag, connection add/remove, context menus, live overlays,
//          drag-drop from palette, Ctrl+D, heatmap mode, fullscreen
//
// graphStore je jediný zdroj pravdy: kdykoli se změní `graph.nodes` /
// `graph.connections` (inspektor, undo/redo, načtení, přidání uzlu…), plátno
// se z nich přepočítá. Dřív se plátno synchronizovalo jen při `graphVersion`,
// takže úpravy v inspektoru ani Undo/Redo nebyly na plátně vidět.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'reactflow'
import type {
  Connection,
  Edge,
  Node,
  ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { customNodeTypes, CHANCE_FAILURE_HANDLE, CHANCE_SUCCESS_HANDLE } from './NodeTypes'
import {
  NODE_TYPE_COLORS, NODE_TYPE_LABELS, NODE_TYPE_NAMES, NODE_TYPE_ORDER,
  createNode, duplicateNode, isKnownNodeType,
} from './nodeCatalog'
import { customEdgeTypes } from './FlowEdge'
import type { FlowEdgeData } from './FlowEdge'
import { NodeInspector } from './NodeInspector'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useSettingsStore } from '../../store/settingsStore'
import { NodeType } from '../../types/graph'
import type { GSSNode, GSSConnection } from '../../types/graph'
import type { TimeSeriesFrame } from '../../types/simulation'

const GSS_TYPE_TO_RF: Record<number, string> = {
  0: 'pool', 1: 'source', 2: 'converter', 3: 'drain',
  4: 'gate', 5: 'chance', 7: 'splitter',
  8: 'timer', 9: 'formula', 10: 'player_action',
}

/** Keys the editor adds to RF node data during replay — preserved across store syncs. */
const OVERLAY_KEYS = ['fillPct', 'liveValue', 'isActive'] as const

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function gssNodeToRF(n: GSSNode, prev: Node | undefined): Node {
  const overlay: Record<string, unknown> = {}
  for (const key of OVERLAY_KEYS) {
    if (prev?.data?.[key] !== undefined) overlay[key] = prev.data[key]
  }
  return {
    ...(prev ?? {}),
    id: n.id,
    type: GSS_TYPE_TO_RF[n.type] ?? 'pool',
    position: n.position,
    data: { ...overlay, gssType: n.type, label: n.label, data: n.data ?? {} },
  }
}

/** Stable edge ID: from/port/to, with a suffix only for duplicate connections in imported files. */
function edgeIds(conns: GSSConnection[]): string[] {
  const seen = new Map<string, number>()
  return conns.map((c) => {
    const base = `e-${c.from_node}-${c.from_port}-${c.to_node}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

function buildEdges(
  conns: GSSConnection[],
  nodes: GSSNode[],
  edgeStyle: FlowEdgeData['edgeStyle'],
  flow: Map<string, FlowEdgeData> | null,
  prevEdges: Edge[],
): Edge[] {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]))
  const selected = new Set(prevEdges.filter((e) => e.selected).map((e) => e.id))
  const ids = edgeIds(conns)
  return conns.map((c, i) => {
    const id = ids[i]
    const isChance = typeById.get(c.from_node) === NodeType.CHANCE
    return {
      id,
      source: c.from_node,
      target: c.to_node,
      sourceHandle: isChance ? (c.from_port === 1 ? CHANCE_FAILURE_HANDLE : CHANCE_SUCCESS_HANDLE) : null,
      targetHandle: null,
      type: 'flow',
      selected: selected.has(id),
      data: { ...(flow?.get(id) ?? { animated: false }), edgeStyle, fromPort: c.from_port },
    }
  })
}

function computeFlowData(
  conns: GSSConnection[],
  nodes: GSSNode[],
  frame: TimeSeriesFrame | null,
  prevFrame: TimeSeriesFrame | null,
  dt: number,
): Map<string, FlowEdgeData> {
  const map = new Map<string, FlowEdgeData>()
  if (!frame) return map

  const nodeMap = new Map<string, GSSNode>()
  for (const n of nodes) nodeMap.set(n.id, n)
  const ids = edgeIds(conns)

  // Estimate per-edge flow rates from node data and pool deltas
  const edgeFlows: number[] = []

  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const fromNode = nodeMap.get(c.from_node)
    const isGateBlocked = frame.gates[c.to_node] === false || frame.gates[c.from_node] === false

    let flowRate = 0
    if (!isGateBlocked && fromNode) {
      const data = (fromNode.data ?? {}) as unknown as Record<string, number>
      switch (fromNode.type) {
        case NodeType.SOURCE:
          flowRate = (data.rate ?? 0) * dt
          break
        case NodeType.CONVERTER: {
          const cycleTime = data.cycle_time ?? 1
          flowRate = cycleTime > 0 ? (data.output_amount ?? 0) / cycleTime * dt : 0
          break
        }
        case NodeType.TIMER:
          flowRate = (data.interval ?? 60) > 0 ? (data.amount ?? 0) / (data.interval ?? 60) * dt : 0
          break
        case NodeType.PLAYER_ACTION:
          flowRate = (data.cadence ?? 5) > 0 ? (data.amount ?? 0) / (data.cadence ?? 5) * dt : 0
          break
        case NodeType.POOL:
          if (prevFrame) {
            const delta = (prevFrame.pools[c.from_node] ?? 0) - (frame.pools[c.from_node] ?? 0)
            if (delta > 0) flowRate = delta // outflow
          }
          break
      }
    }

    edgeFlows.push(flowRate)
    map.set(ids[i], { flowRate, maxFlowRate: 0, isGateBlocked, animated: true })
  }

  const maxFlow = Math.max(0.001, ...edgeFlows)
  for (const fd of map.values()) fd.maxFlowRate = maxFlow

  return map
}

interface PaneCtxMenu { x: number; y: number; canvasX: number; canvasY: number }
interface NodeCtxMenu { x: number; y: number; nodeId: string }

function GraphEditorInner() {
  const { graph, addNode, removeNode, addConnection, removeConnection, updateNode } = useGraphStore()
  const reportA = useSimulationStore((s) => s.reportA)
  const replayTick = useSimulationStore((s) => s.replayTick)
  const settings = useSettingsStore((s) => s.settings)

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes.map((n) => gssNodeToRF(n, undefined)))
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [paneCtx, setPaneCtx] = useState<PaneCtxMenu | null>(null)
  const [nodeCtx, setNodeCtx] = useState<NodeCtxMenu | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  // ── Sync: store → canvas nodes (keeps selection, measured size, overlays) ──
  useEffect(() => {
    setNodes((nds: Node[]) => {
      const prevById = new Map(nds.map((n) => [n.id, n]))
      return graph.nodes.map((n) => gssNodeToRF(n, prevById.get(n.id)))
    })
  }, [graph.nodes, setNodes])

  // ── Live overlays: pool fill + live value badge + gate state ───────────────
  useEffect(() => {
    if (!reportA?.time_series.length) {
      setNodes((nds: Node[]) => nds.map((n) => ({ ...n, data: { ...n.data, fillPct: undefined, liveValue: undefined, isActive: undefined } })))
      return
    }
    const ts = reportA.time_series
    const frame = ts.find((f) => f.time >= replayTick) ?? ts[ts.length - 1]
    if (!frame) return
    setNodes((nds: Node[]) =>
      nds.map((n) => {
        const amount = frame.pools[n.id]
        const gate = frame.gates?.[n.id]
        const cap = (n.data as { data?: { capacity?: number } }).data?.capacity ?? 100
        if (amount !== undefined) {
          return {
            ...n,
            data: {
              ...n.data,
              fillPct: Math.min(1, Math.max(0, amount / Math.max(cap, 1))),
              liveValue: amount.toFixed(0),
            },
          }
        }
        if (gate !== undefined) return { ...n, data: { ...n.data, isActive: gate } }
        return n
      }),
    )
  }, [replayTick, reportA, setNodes])

  // ── Edges: store connections + animated flow data from the replay frame ───
  useEffect(() => {
    let flow: Map<string, FlowEdgeData> | null = null
    if (reportA?.time_series.length && !settings.performanceMode) {
      const ts = reportA.time_series
      const dt = reportA.scenario?.dt ?? 1.0
      const frameIdx = ts.findIndex((f) => f.time >= replayTick)
      const frame = frameIdx >= 0 ? ts[frameIdx] : ts[ts.length - 1]
      const prevFrame = frameIdx > 0 ? ts[frameIdx - 1] : null
      flow = computeFlowData(graph.connections, graph.nodes, frame, prevFrame, dt)
    }
    setEdges((prev: Edge[]) => buildEdges(graph.connections, graph.nodes, settings.edgeStyle, flow, prev))
  }, [replayTick, reportA, graph.connections, graph.nodes, setEdges, settings.performanceMode, settings.edgeStyle])

  // ── Search: compute matched node IDs ────────────────────────────────
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const matched = new Set<string>()
    for (const n of graph.nodes) {
      const label = (n.label ?? '').toLowerCase()
      const typeLabel = (NODE_TYPE_LABELS[n.type] ?? '').toLowerCase()
      const nodeId = String(n.id).toLowerCase()
      if (label.includes(q) || typeLabel.includes(q) || nodeId.includes(q)) {
        matched.add(n.id)
      }
    }
    return matched
  }, [searchQuery, graph.nodes])

  // ── Node styling: search highlight has priority over heatmap glow ─────────
  // (Dřív dva efekty přepisovaly `style` navzájem podle pořadí spuštění.)
  useEffect(() => {
    let heat: ((id: string) => Record<string, unknown>) | null = null
    if (heatmap && reportA?.time_series.length && !settings.performanceMode) {
      const maxVals: Record<string, number> = {}
      for (const f of reportA.time_series)
        for (const [id, v] of Object.entries(f.pools))
          maxVals[id] = Math.max(maxVals[id] ?? 0, v)
      const gMax = Math.max(1, ...Object.values(maxVals))
      heat = (id) => {
        const act = (maxVals[id] ?? 0) / gMax
        const r = Math.round(act * 220)
        const g = Math.round((1 - act) * 80)
        const b = Math.round((1 - act) * 180)
        return { filter: `drop-shadow(0 0 ${Math.round(act * 14)}px rgb(${r},${g},${b}))`, opacity: 0.35 + act * 0.65 }
      }
    }
    setNodes((nds: Node[]) =>
      nds.map((n) => {
        let style: Record<string, unknown> | undefined
        if (searchMatchIds) {
          style = searchMatchIds.has(n.id)
            ? { filter: 'drop-shadow(0 0 8px #3b82f6)', zIndex: 10 }
            : { opacity: 0.25, filter: 'grayscale(0.8)' }
        } else if (heat) {
          style = heat(n.id)
        }
        return { ...n, style }
      }),
    )
  }, [heatmap, reportA, searchMatchIds, settings.performanceMode, setNodes, graph.nodes])

  // ── Fit view ──────────────────────────────────────────────────────────────
  const fitView = useCallback(() => rfInstance.current?.fitView({ padding: 0.2, duration: 300 }), [])

  const duplicateById = useCallback((nodeId: string) => {
    const src = graph.nodes.find((n) => n.id === nodeId)
    if (src) addNode(duplicateNode(src))
  }, [graph.nodes, addNode])

  // ── Keyboard shortcuts (never while typing into a field) ─────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showSearch) { setShowSearch(false); setSearchQuery('') }
        else if (fullscreen) setFullscreen(false)
        setPaneCtx(null)
        setNodeCtx(null)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
        return
      }
      if (isTypingTarget(e.target)) return
      if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateById(selectedId)
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'f') {
        fitView()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, duplicateById, showSearch, fullscreen, fitView])

  // ── Canvas events ─────────────────────────────────────────────────────────
  const onNodeClick = useCallback((_: unknown, n: Node) => { setSelectedId(n.id); setPaneCtx(null); setNodeCtx(null) }, [])
  const onPaneClick = useCallback(() => { setSelectedId(null); setPaneCtx(null); setNodeCtx(null) }, [])
  const onNodeDragStop = useCallback((_: unknown, n: Node) => updateNode(n.id, { position: n.position }), [updateNode])
  const onEdgesDelete = useCallback(
    (eds: Edge[]) => eds.forEach((e) => removeConnection(e.source, e.target, (e.data as { fromPort?: number } | undefined)?.fromPort)),
    [removeConnection],
  )
  const onNodesDelete = useCallback((nds: Node[]) => nds.forEach((n) => removeNode(n.id)), [removeNode])

  // Smyčka uzlu sám na sebe (např. Splitter → tentýž Splitter) nemá smysl a
  // dřív vedla k nekonečné rekurzi v simulaci.
  const isValidConnection = useCallback((c: Connection) => !!c.source && !!c.target && c.source !== c.target, [])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return
      // Port podle handle: Chance má výstup "success" (port 0) a "failure" (port 1).
      const fromPort = params.sourceHandle === CHANCE_FAILURE_HANDLE ? 1 : 0
      addConnection({ from_node: params.source, to_node: params.target, from_port: fromPort, to_port: 0 })
    },
    [addConnection],
  )

  const onPaneContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault()
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPaneCtx({ x: event.clientX, y: event.clientY, canvasX: event.clientX - bounds.left, canvasY: event.clientY - bounds.top })
    setNodeCtx(null)
  }, [])

  const onNodeContextMenu = useCallback((event: MouseEvent, node: Node) => {
    event.preventDefault()
    event.stopPropagation()
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds) return
    setNodeCtx({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, nodeId: node.id })
    setPaneCtx(null)
  }, [])

  // ── Add node from pane context menu ──────────────────────────────────────
  const addNodeOfType = useCallback(
    (type: number) => {
      if (!paneCtx || !rfInstance.current || !isKnownNodeType(type)) return
      const pos = rfInstance.current.screenToFlowPosition({ x: paneCtx.x, y: paneCtx.y })
      addNode(createNode(type, pos))
      setPaneCtx(null)
    },
    [paneCtx, addNode],
  )

  // ── Node context menu actions ─────────────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    removeNode(nodeId)
    if (selectedId === nodeId) setSelectedId(null)
    setNodeCtx(null)
  }, [removeNode, selectedId])

  const duplicateFromMenu = useCallback((nodeId: string) => {
    duplicateById(nodeId)
    setNodeCtx(null)
  }, [duplicateById])

  // ── Drag & drop from NodePalette ──────────────────────────────────────────
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const typeStr = e.dataTransfer.getData('application/gss-nodetype')
    if (!typeStr || !rfInstance.current) return
    const type = parseInt(typeStr, 10)
    if (!isKnownNodeType(type)) return
    const pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(createNode(type, pos))
  }, [addNode])

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[100] flex bg-bg' : 'flex w-full h-full'}>

      {/* ── Canvas ── */}
      <div ref={wrapperRef} className="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          nodeTypes={customNodeTypes}
          edgeTypes={customEdgeTypes}
          onInit={(inst: ReactFlowInstance) => { rfInstance.current = inst }}
          fitView
          deleteKeyCode={['Delete', 'Backspace']}
          snapToGrid={settings.snapToGrid}
          snapGrid={[settings.gridSize, settings.gridSize]}
          defaultEdgeOptions={{ type: 'flow' }}
          proOptions={{ hideAttribution: true }}
          className="bg-bg"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a3a" />
          <Controls className="!bg-card !border-border !shadow-none" />
          {settings.showMinimap && !settings.performanceMode && (
            <MiniMap
              nodeColor={(n: Node) => NODE_TYPE_COLORS[(n.data as { gssType?: number })?.gssType ?? 0] ?? '#3b82f6'}
              maskColor="rgba(10,10,20,0.7)"
              className="!bg-card !border !border-border"
            />
          )}
        </ReactFlow>

        {/* ── Search bar (top-left overlay) ── */}
        {showSearch && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
            <div className="flex items-center bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <span className="pl-2.5 text-white/40 text-xs">🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search nodes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-white text-xs px-2 py-1.5 w-48 placeholder:text-white/30"
                autoFocus
              />
              {searchQuery && (
                <span className="text-[10px] text-muted pr-2">
                  {searchMatchIds ? searchMatchIds.size : 0}/{graph.nodes.length}
                </span>
              )}
              <button
                onClick={() => { setShowSearch(false); setSearchQuery('') }}
                aria-label="Close search"
                className="px-2 py-1.5 text-white/40 hover:text-white text-xs transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Overlay toolbar (top-right) ── */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
          <button
            onClick={() => { setShowSearch((s) => !s); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50) }}
            title="Search nodes (Ctrl+F)"
            aria-label="Search nodes"
            className={`w-8 h-8 border rounded flex items-center justify-center text-xs transition-colors ${showSearch ? 'bg-blue-500/20 border-blue-400 text-blue-400' : 'bg-card border-border text-white/50 hover:text-white hover:border-white/30'}`}>
            🔍
          </button>
          <button onClick={fitView} title="Fit to view (F)" aria-label="Fit view to graph"
            className="w-8 h-8 bg-card border border-border rounded text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center text-sm transition-colors">
            ⊡
          </button>
          <button
            onClick={() => setHeatmap((h) => !h)}
            title={heatmap ? 'Disable heatmap' : 'Heatmap mode — color nodes by activity (requires simulation)'}
            aria-label={heatmap ? 'Disable heatmap' : 'Enable heatmap mode'}
            aria-pressed={heatmap}
            className={`w-8 h-8 border rounded flex items-center justify-center text-xs transition-colors ${heatmap ? 'bg-orange-500/20 border-orange-400 text-orange-400' : 'bg-card border-border text-white/50 hover:text-white hover:border-white/30'
              }`}>
            🌡
          </button>
          <button
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen editor'}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={fullscreen}
            className="w-8 h-8 bg-card border border-border rounded text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center text-xs transition-colors">
            {fullscreen ? '✕' : '⛶'}
          </button>
        </div>

        {/* ── Pane context menu (right-click on empty canvas) ── */}
        {paneCtx && (
          <div
            className="absolute z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: paneCtx.canvasX, top: paneCtx.canvasY }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-widest font-semibold border-b border-border mb-1">
              Add Node
            </div>
            {NODE_TYPE_ORDER.map((type) => (
              <button key={type} onClick={() => addNodeOfType(type)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white hover:bg-border transition-colors text-left">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: NODE_TYPE_COLORS[type] }} />
                {NODE_TYPE_NAMES[type]}
              </button>
            ))}
          </div>
        )}

        {/* ── Node context menu (right-click on node) ── */}
        {nodeCtx && (
          <div
            className="absolute z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: nodeCtx.x, top: nodeCtx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => duplicateFromMenu(nodeCtx.nodeId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white hover:bg-border transition-colors text-left">
              ⧉ Duplicate <span className="ml-auto text-white/30">Ctrl+D</span>
            </button>
            <div className="border-t border-border my-0.5" />
            <button onClick={() => deleteNode(nodeCtx.nodeId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-border transition-colors text-left">
              ✕ Delete <span className="ml-auto text-white/30">Del</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Node Inspector panel ── */}
      <div className="w-56 flex-shrink-0 border-l border-border bg-card overflow-hidden">
        <NodeInspector selectedNodeId={selectedId} />
      </div>
    </div>
  )
}

export function GraphEditor() {
  return (
    <ReactFlowProvider>
      <GraphEditorInner />
    </ReactFlowProvider>
  )
}
