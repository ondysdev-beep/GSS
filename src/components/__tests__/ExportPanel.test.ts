// ExportPanel.test.ts — pokrývá PDF Report a Web Share HTML generátory
// (buildPDFHtml/buildWebShareHtml), které byly implementované ve v3.2.0
// (viz DEVLOG.md), ale dosud neměly žádné testy.

import { describe, it, expect } from 'vitest'
import { buildPDFHtml, buildWebShareHtml } from '../ui/ExportPanel'
import type { GSSGraph } from '../../types/graph'
import type { RunReport, VerdictReport } from '../../types/simulation'

const GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'Test <Economy> & "Report"',
  description: 'A sample economy',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 42,
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
  ],
  connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
}

const REPORT: RunReport = {
  summary: {
    total_ticks: 60,
    elapsed: 12.3,
    final_values: { pool1: 500 },
    min_values: { pool1: 0 },
    max_values: { pool1: 500 },
  },
  time_series: [],
} as unknown as RunReport

describe('buildPDFHtml', () => {
  it('produces a well-formed HTML document', () => {
    const html = buildPDFHtml(GRAPH, REPORT, null)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('includes graph name and simulation summary', () => {
    const html = buildPDFHtml(GRAPH, REPORT, null)
    expect(html).toContain('Nodes: 2')
    expect(html).toContain('Ticks: 60')
  })

  it('includes verdict info when provided', () => {
    const verdict = {
      verdict: { state: 'SAFE' },
      health_score: { total: 87 },
    } as unknown as VerdictReport
    const html = buildPDFHtml(GRAPH, REPORT, verdict)
    expect(html).toContain('SAFE')
    expect(html).toContain('87')
  })

  it('escapes HTML-special characters from the graph (graphs can come from the Community Library)', () => {
    const html = buildPDFHtml(GRAPH, REPORT, null)
    expect(html).toContain('Test &lt;Economy&gt; &amp; &quot;Report&quot;')
    expect(html).not.toContain('<Economy>')
  })

  it('labels the simulated time in seconds, not milliseconds', () => {
    expect(buildPDFHtml(GRAPH, REPORT, null)).toContain('Simulated time: 12.3 s')
  })
})

describe('buildWebShareHtml', () => {
  it('produces a well-formed HTML document', () => {
    const html = buildWebShareHtml(GRAPH, REPORT)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('lists all nodes and connections', () => {
    const html = buildWebShareHtml(GRAPH, REPORT)
    expect(html).toContain('Source')
    expect(html).toContain('Pool')
    expect(html).toContain('src1 → pool1')
  })

  it('escapes node labels so a malicious label cannot inject markup', () => {
    const evil = { ...GRAPH, nodes: [{ ...GRAPH.nodes[0], label: '<img src=x onerror=alert(1)>' }] }
    const html = buildWebShareHtml(evil, null)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('handles a missing report gracefully', () => {
    const html = buildWebShareHtml(GRAPH, null)
    expect(html).toContain('No simulation data')
  })
})
