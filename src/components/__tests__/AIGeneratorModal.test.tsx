// AIGeneratorModal.test.tsx — regrese B3: zavření modalu během běžícího
// generování nesmí později tiše přepsat graf, jakmile request doběhne.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AIGeneratorModal } from '../ui/AIGeneratorModal'
import * as EconomyGenerator from '../../core/EconomyGenerator'
import { useGraphStore } from '../../store/graphStore'

vi.mock('../../core/EconomyGenerator', async () => {
  const actual = await vi.importActual<typeof EconomyGenerator>('../../core/EconomyGenerator')
  return { ...actual, hasAnthropicApiKey: vi.fn(), generateEconomyGraph: vi.fn() }
})

const VALID_GRAPH = {
  version: '3.0', tick_spec_version: 1, name: 'AI Graph', description: '',
  created_at: '', modified_at: '', simulation_seed: 1,
  nodes: [{ id: 'p1', type: 0, label: 'Pool', position: { x: 0, y: 0 }, data: { resource: 'Gold', capacity: 100 } }],
  connections: [],
}

describe('AIGeneratorModal — regrese B3', () => {
  beforeEach(() => {
    vi.mocked(EconomyGenerator.hasAnthropicApiKey).mockResolvedValue(true)
    useGraphStore.getState().newGraph()
  })

  it('does not overwrite the graph with a generation result if the modal was closed meanwhile', async () => {
    let resolveGenerate!: (g: typeof VALID_GRAPH) => void
    vi.mocked(EconomyGenerator.generateEconomyGraph).mockReturnValue(
      new Promise((resolve) => { resolveGenerate = resolve as never }),
    )

    const onClose = vi.fn()
    render(<AIGeneratorModal open={true} onClose={onClose} onOpenSettings={() => {}} />)

    await waitFor(() => expect(screen.getByPlaceholderText(/Idle mobile game/)).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/Idle mobile game/), { target: { value: 'test economy' } })
    fireEvent.click(screen.getByRole('button', { name: /Generate graph/ }))

    const nameBeforeClose = useGraphStore.getState().graph.name

    // Uživatel zavře modal DŘÍV, než request doběhne.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()

    // Request až teď doběhne — dřív by tohle tiše přepsalo graf.
    resolveGenerate(VALID_GRAPH)
    await new Promise((r) => setTimeout(r, 10))

    expect(useGraphStore.getState().graph.name).toBe(nameBeforeClose)
    expect(useGraphStore.getState().graph.name).not.toBe('AI Graph')
  })
})
