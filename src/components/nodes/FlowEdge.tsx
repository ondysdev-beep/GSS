// FlowEdge.tsx — Custom ReactFlow edge with live flow rate label and intensity coloring
// Shows resource flow rate on edges during simulation replay.

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow'
import type { EdgeProps } from 'reactflow'

export interface FlowEdgeData {
  flowRate?: number       // units/tick flowing through this edge
  maxFlowRate?: number    // max flow rate across all edges (for normalization)
  isGateBlocked?: boolean // true if a gate on this path is closed
  animated?: boolean      // whether simulation is active
}

function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<FlowEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const flowRate = data?.flowRate ?? 0
  const maxFlow = data?.maxFlowRate ?? 1
  const isBlocked = data?.isGateBlocked ?? false
  const hasSimData = data?.animated ?? false

  // Compute edge color based on flow intensity
  let strokeColor = '#4b5563' // default gray
  let strokeWidth = 1.5
  let dashArray: string | undefined

  if (hasSimData) {
    if (isBlocked) {
      strokeColor = '#ef444466'
      strokeWidth = 1.5
      dashArray = '5 5'
    } else if (flowRate > 0) {
      const intensity = Math.min(1, flowRate / Math.max(maxFlow, 0.001))
      // Green gradient: dim green → bright green
      const g = Math.round(140 + intensity * 115) // 140–255
      const r = Math.round(30 - intensity * 30)    // 30–0
      const b = Math.round(80 - intensity * 40)    // 80–40
      strokeColor = `rgb(${r},${g},${b})`
      strokeWidth = 1.5 + intensity * 2
    } else {
      strokeColor = '#4b556380'
      strokeWidth = 1
    }
  }

  // Format flow rate for display
  const flowLabel = flowRate >= 1000
    ? `${(flowRate / 1000).toFixed(1)}k`
    : flowRate >= 100
      ? flowRate.toFixed(0)
      : flowRate >= 1
        ? flowRate.toFixed(1)
        : flowRate > 0
          ? flowRate.toFixed(2)
          : ''

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: dashArray,
          transition: 'stroke 0.3s, stroke-width 0.3s',
        }}
      />
      {hasSimData && flowLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: '9px',
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 600,
              color: isBlocked ? '#ef4444' : strokeColor,
              background: 'rgba(10, 10, 20, 0.85)',
              padding: '1px 4px',
              borderRadius: '3px',
              border: `1px solid ${isBlocked ? '#ef444440' : strokeColor + '40'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {isBlocked ? '✗' : `${flowLabel}/t`}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const FlowEdgeComponent = memo(FlowEdge)
FlowEdgeComponent.displayName = 'FlowEdge'

export const customEdgeTypes = {
  flow: FlowEdgeComponent,
}
