import { describe, it, expect } from 'vitest'
import { customizeTemplate } from '../TemplateCustomizer'
import { getTemplate, TEMPLATE_LIST } from '../GraphTemplates'

describe('customizeTemplate', () => {
  it('renames the primary resource across all matching fields', () => {
    const graph = getTemplate('idle_tycoon')!
    const result = customizeTemplate(graph, { renameFrom: 'gold', renameTo: 'Crystals', scale: 'medium' })
    const resources = result.nodes.map((n) => (n.data as { resource?: string }).resource).filter(Boolean)
    expect(resources.every((r) => r === 'Crystals')).toBe(true)
    expect(resources).not.toContain('gold')
  })

  it('does not touch resources that do not match renameFrom', () => {
    const graph = getTemplate('resource_chain')!  // wood → plank → furniture
    const result = customizeTemplate(graph, { renameFrom: 'wood', renameTo: 'Iron', scale: 'medium' })
    const resources = result.nodes.map((n) => (n.data as { resource?: string; output_resource?: string; input_resource?: string }))
    // Only 'wood' nodes change; 'plank'/'furniture' stay as-is.
    expect(JSON.stringify(resources)).toContain('Iron')
    expect(JSON.stringify(resources)).toContain('plank')
  })

  it('scales numeric fields by the chosen factor', () => {
    const graph = getTemplate('idle_tycoon')!
    const small = customizeTemplate(graph, { renameFrom: 'gold', renameTo: 'gold', scale: 'small' })
    const large = customizeTemplate(graph, { renameFrom: 'gold', renameTo: 'gold', scale: 'large' })
    const originalRate = (graph.nodes[0].data as { rate: number }).rate
    const smallRate = (small.nodes[0].data as { rate: number }).rate
    const largeRate = (large.nodes[0].data as { rate: number }).rate
    expect(smallRate).toBeCloseTo(originalRate * 0.5)
    expect(largeRate).toBeCloseTo(originalRate * 2)
  })

  it('medium scale (×1) leaves numeric values unchanged', () => {
    const graph = getTemplate('idle_tycoon')!
    const result = customizeTemplate(graph, { renameFrom: 'gold', renameTo: 'gold', scale: 'medium' })
    expect(result.nodes).toEqual(graph.nodes)
  })

  it('does not mutate the original template graph', () => {
    const graph = getTemplate('idle_tycoon')!
    const before = JSON.stringify(graph)
    customizeTemplate(graph, { renameFrom: 'gold', renameTo: 'Crystals', scale: 'large' })
    expect(JSON.stringify(graph)).toBe(before)
  })

  it('every template has a valid primaryResource present in its own graph', () => {
    for (const meta of TEMPLATE_LIST) {
      const graph = getTemplate(meta.id)!
      const resources = graph.nodes.map((n) => (n.data as { resource?: string }).resource).filter(Boolean)
      expect(resources).toContain(meta.primaryResource)
    }
  })

  it('regrese B6: přejmenuje resource i uvnitř Formula výrazu, ne jen v poli "resource"', () => {
    // Žádná vestavěná šablona dnes Formula uzel nemá (ověřeno v auditu),
    // takže tenhle test si ho pro ověření opravy vytváří ručně.
    const graph = getTemplate('idle_tycoon')!
    const withFormula: typeof graph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'formula1', type: 9, label: 'Bonus', position: { x: 0, y: 0 },
          data: { expression: 'gold * 1.2 + goldfish', output_resource: 'gold' } as never,
        },
      ],
    }
    const result = customizeTemplate(withFormula, { renameFrom: 'gold', renameTo: 'Crystals', scale: 'medium' })
    const formulaNode = result.nodes.find((n) => n.id === 'formula1')!
    const data = formulaNode.data as unknown as { expression: string; output_resource: string }
    expect(data.expression).toBe('Crystals * 1.2 + goldfish')  // "goldfish" nesmí být zasažen (hranice slova)
    expect(data.output_resource).toBe('Crystals')
  })
})
