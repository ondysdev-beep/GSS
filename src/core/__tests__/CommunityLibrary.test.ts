import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCommunityIndex, importGraphFromUrl, graphToShareableJson, CommunityLibraryError } from '../CommunityLibrary'
import type { GSSGraph } from '../../types/graph'

const VALID_GRAPH = {
  name: 'Shared Economy',
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
  ],
  connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
}

describe('fetchCommunityIndex', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => { globalThis.fetch = originalFetch })

  it('parses a valid index response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'x', name: 'X', author: 'A', description: 'D', category: 'C', url: 'https://example.com/x.json' }],
    }) as unknown as typeof fetch
    const entries = await fetchCommunityIndex('https://example.com/index.json')
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('x')
  })

  it('throws CommunityLibraryError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(fetchCommunityIndex('https://example.com/index.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('throws CommunityLibraryError on non-array response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ not: 'an array' }) }) as unknown as typeof fetch
    await expect(fetchCommunityIndex('https://example.com/index.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('throws CommunityLibraryError on HTTP error status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    await expect(fetchCommunityIndex('https://example.com/index.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })
})

describe('importGraphFromUrl', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => { globalThis.fetch = vi.fn() as unknown as typeof fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('imports and validates a well-formed graph', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(VALID_GRAPH),
    } as Response)
    const graph = await importGraphFromUrl('https://example.com/graph.json')
    expect(graph.nodes).toHaveLength(2)
  })

  it('rejects an empty URL', async () => {
    await expect(importGraphFromUrl('  ')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('rejects invalid JSON without crashing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => 'not json {{{' } as Response)
    await expect(importGraphFromUrl('https://example.com/graph.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('rejects JSON that is not a GSS graph', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ hello: 'world' }) } as Response)
    await expect(importGraphFromUrl('https://example.com/graph.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('rejects a structurally invalid graph (duplicate node IDs) instead of importing it blindly', async () => {
    const bad = {
      nodes: [
        { id: 'dup', type: 1, label: 'A', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
        { id: 'dup', type: 0, label: 'B', position: { x: 100, y: 0 }, data: { resource: 'Gold', capacity: 100 } },
      ],
      connections: [],
    }
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(bad) } as Response)
    await expect(importGraphFromUrl('https://example.com/graph.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })

  it('rewrites a gist.github.com URL to its raw form', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(VALID_GRAPH) } as Response)
    await importGraphFromUrl('https://gist.github.com/someuser/abcdef1234567890')
    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0]
    expect(calledUrl).toBe('https://gist.githubusercontent.com/someuser/abcdef1234567890/raw/')
  })

  it('regrese B7: gist ID s velkými písmeny se také převede na raw formát', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(VALID_GRAPH) } as Response)
    await importGraphFromUrl('https://gist.github.com/someuser/ABCDEF1234567890')
    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0]
    expect(calledUrl).toBe('https://gist.githubusercontent.com/someuser/ABCDEF1234567890/raw/')
  })

  it('surfaces HTTP error status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(importGraphFromUrl('https://example.com/graph.json')).rejects.toBeInstanceOf(CommunityLibraryError)
  })
})

describe('graphToShareableJson', () => {
  it('produces parseable JSON containing the graph nodes', () => {
    const json = graphToShareableJson(VALID_GRAPH as unknown as GSSGraph)
    const parsed = JSON.parse(json)
    expect(parsed.nodes).toHaveLength(2)
  })
})
