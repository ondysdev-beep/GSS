// CommunityLibraryPanel.tsx — Community Library (Fáze 8 nových funkcí).
//
// Tři sekce: Browse (statický index z GitHubu), Import from URL (funguje
// okamžitě s libovolnou URL), Share (export aktuálního grafu jako JSON
// pro ruční nahrání/sdílení — žádný GitHub OAuth flow v této fázi).

import { useState, useEffect, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import {
  fetchCommunityIndex, importGraphFromUrl, graphToShareableJson,
  CommunityLibraryError, type CommunityEntry,
} from '../../core/CommunityLibrary'

export function CommunityLibraryPanel() {
  const graph = useGraphStore((s) => s.graph)
  const setGraph = useGraphStore((s) => s.setGraph)
  const resetSim = useSimulationStore((s) => s.reset)

  const [entries, setEntries] = useState<CommunityEntry[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  // Oprava B3: tento panel se odpojí (unmount), když uživatel přepne na
  // jiný Library sub-tab. `setGraph` je akce Zustand store (ne React state),
  // takže by se i po odpojení tiše zavolala a přepsala aktuální graf, když
  // by import mezitím doběhl — i když uživatel dávno odešel jinam.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  useEffect(() => {
    fetchCommunityIndex()
      .then((data) => { if (mountedRef.current) setEntries(data) })
      .catch((err) => { if (mountedRef.current) setIndexError(err instanceof CommunityLibraryError ? err.message : String(err)) })
  }, [])

  async function doImport(url: string, id: string) {
    setBusyId(id)
    setImportError(null)
    try {
      const g = await importGraphFromUrl(url)
      if (!mountedRef.current) return  // uživatel mezitím přepnul na jiný tab — výsledek zahodit
      setGraph(g)
      resetSim()
    } catch (err) {
      if (mountedRef.current) setImportError(err instanceof CommunityLibraryError ? err.message : String(err))
    } finally {
      if (mountedRef.current) setBusyId(null)
    }
  }

  async function copyShareJson() {
    try {
      await navigator.clipboard.writeText(graphToShareableJson(graph))
      setCopyMsg('✓ Copied to clipboard')
      setTimeout(() => setCopyMsg(null), 3000)
    } catch {
      setCopyMsg('Copy failed — try exporting to a file instead (Library → Export).')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">Import from URL</h3>
        <p className="text-[10px] text-muted mb-2">
          Paste a link to a .gss/.json file (GitHub raw, Gist, your own hosting) — the graph is validated before loading, same as the AI generator.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://gist.github.com/… or a raw JSON URL"
            className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-accent/50 transition-colors"
          />
          <button
            onClick={() => doImport(importUrl, '__manual__')}
            disabled={busyId === '__manual__' || !importUrl.trim()}
            className="px-3 py-1.5 text-xs bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors disabled:opacity-40"
          >
            {busyId === '__manual__' ? '…' : 'Import'}
          </button>
        </div>
        {importError && <div className="text-[10px] text-danger mt-1.5">{importError}</div>}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">Share current graph</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={copyShareJson}
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/60 rounded transition-colors"
          >
            📋 Copy as JSON
          </button>
          {copyMsg && <span className="text-[10px] text-muted">{copyMsg}</span>}
        </div>
        <p className="text-[9px] text-muted mt-1.5">
          Upload the copied JSON as a GitHub Gist (or anywhere else) and share the link — anyone can then paste it above via "Import from URL".
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">Browse community library</h3>
        {indexError && (
          <div className="text-[10px] text-danger">Failed to load community index: {indexError}</div>
        )}
        {!entries && !indexError && (
          <div className="text-[10px] text-muted">Loading…</div>
        )}
        {entries && entries.length === 0 && (
          <div className="text-[10px] text-muted">The community index is empty for now.</div>
        )}
        {entries && entries.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {entries.map((e) => (
              <div key={e.id} className="p-2.5 rounded border border-border bg-card flex flex-col gap-1">
                <div className="text-xs text-white font-medium">{e.name}</div>
                <div className="text-[9px] text-muted">{e.category} · {e.author}</div>
                <div className="text-[10px] text-white/50">{e.description}</div>
                <button
                  onClick={() => doImport(e.url, e.id)}
                  disabled={busyId === e.id}
                  className="self-start mt-1 px-2 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors disabled:opacity-40"
                >
                  {busyId === e.id ? 'Importing…' : 'Import'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
