import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateEconomyGraph, EconomyGenerationError } from '../EconomyGenerator'
import { platform, PlatformUnsupportedError } from '../../platform'

vi.mock('../../platform', async () => {
  const actual = await vi.importActual<typeof import('../../platform')>('../../platform')
  return { ...actual, platform: { ...actual.platform, generateEconomyGraph: vi.fn() } }
})

const mockedGenerate = vi.mocked(platform.generateEconomyGraph)

const VALID_GRAPH_JSON = JSON.stringify({
  name: 'Test Economy',
  description: 'Generated',
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
  ],
  connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
})

describe('generateEconomyGraph', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
  })

  it('parses and returns a valid generated graph', async () => {
    mockedGenerate.mockResolvedValue(VALID_GRAPH_JSON)
    const graph = await generateEconomyGraph('idle game with gold')
    expect(graph.name).toBe('Test Economy')
    expect(graph.nodes).toHaveLength(2)
  })

  it('strips markdown code fences before parsing', async () => {
    mockedGenerate.mockResolvedValue('```json\n' + VALID_GRAPH_JSON + '\n```')
    const graph = await generateEconomyGraph('idle game')
    expect(graph.nodes).toHaveLength(2)
  })

  it('throws EconomyGenerationError on invalid JSON', async () => {
    mockedGenerate.mockResolvedValue('not valid json {{{')
    await expect(generateEconomyGraph('x')).rejects.toBeInstanceOf(EconomyGenerationError)
  })

  it('regrese B9: rozpozná pravděpodobně useknutou odpověď a dá konkrétnější hlášku', async () => {
    // Odpověď, která vypadá jako JSON, ale nekončí "}" ani "]" — typický
    // příznak oříznutí kvůli max_tokens limitu, ne obecně špatný JSON.
    const truncated = '{"name":"Big Economy","nodes":[{"id":"n1","type":1,"label":"Source","position":{"x":0,"y":0},"data":{"resource":"Gol'
    mockedGenerate.mockResolvedValue(truncated)
    await expect(generateEconomyGraph('x')).rejects.toThrow(/looks cut off/)
  })

  it('throws EconomyGenerationError when "nodes" is missing', async () => {
    mockedGenerate.mockResolvedValue(JSON.stringify({ name: 'Broken' }))
    await expect(generateEconomyGraph('x')).rejects.toThrow(/does not match/)
  })

  it('rejects a structurally invalid graph instead of loading it blindly', async () => {
    // Duplicate node IDs — a real GraphValidator ERROR.
    const badGraph = JSON.stringify({
      name: 'Bad',
      nodes: [
        { id: 'dup', type: 1, label: 'A', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
        { id: 'dup', type: 0, label: 'B', position: { x: 100, y: 0 }, data: { resource: 'Gold', capacity: 100 } },
      ],
      connections: [],
    })
    mockedGenerate.mockResolvedValue(badGraph)
    await expect(generateEconomyGraph('x')).rejects.toBeInstanceOf(EconomyGenerationError)
  })

  it('propagates the Rust command error (e.g. missing API key)', async () => {
    mockedGenerate.mockRejectedValue('No Anthropic API key configured.')
    await expect(generateEconomyGraph('x')).rejects.toBeTruthy()
  })

  it('converts PlatformUnsupportedError (web bez CORS proxy) na EconomyGenerationError', async () => {
    mockedGenerate.mockRejectedValue(new PlatformUnsupportedError('AI Economy Generator', 'web'))
    await expect(generateEconomyGraph('x')).rejects.toBeInstanceOf(EconomyGenerationError)
  })
})
