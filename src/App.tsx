import { useState, useEffect, Suspense, lazy } from 'react'
import { GraphEditor } from './components/nodes/GraphEditor'
import { IssuesPanel } from './components/ui/IssuesPanel'
import { ReplaySlider } from './components/ui/ReplaySlider'
import { Toolbar } from './components/ui/Toolbar'
import { ProGate } from './components/ui/ProGate'
import { NodePalette } from './components/ui/NodePalette'
import { StatusBar } from './components/ui/StatusBar'
import { CommandPalette } from './components/ui/CommandPalette'
import { SettingsModal } from './components/ui/SettingsModal'
import { WelcomeModal, hasSeenWelcome } from './components/ui/WelcomeModal'
import { useLicense } from './hooks/useLicense'
import { useSimulation } from './hooks/useSimulation'
import { useAutoSave, loadAutoSave } from './hooks/useAutoSave'
import { useVersionHistory } from './hooks/useVersionHistory'
import { useGraphStore } from './store/graphStore'
import type { GSSGraph } from './types/graph'
import { APP_VERSION } from './core/UpdateChecker'
import { UpdateBanner } from './components/ui/UpdateBanner'

// Code splitting (audit R-16): these are only rendered outside the default
// "editor" tab and, for the charts, pull in the recharts library — keeping
// them out of the initial bundle means opening GSS to the graph editor
// (the common case) doesn't pay for AutoTuner/Intelligence/charting code
// it isn't using yet. Deliberately NOT applied everywhere (e.g. GraphEditor,
// Toolbar, NodePalette stay eager — they're needed immediately on launch).
const ExportPanel = lazy(() => import('./components/ui/ExportPanel').then((m) => ({ default: m.ExportPanel })))
const LicensePanel = lazy(() => import('./components/ui/LicensePanel').then((m) => ({ default: m.LicensePanel })))
const WealthOverTimeChart = lazy(() => import('./components/charts/WealthOverTimeChart').then((m) => ({ default: m.WealthOverTimeChart })))
const ProductionSummaryChart = lazy(() => import('./components/charts/ProductionSummaryChart').then((m) => ({ default: m.ProductionSummaryChart })))
const XPCurveChart = lazy(() => import('./components/charts/XPCurveChart').then((m) => ({ default: m.XPCurveChart })))
const PowerBalanceChart = lazy(() => import('./components/charts/PowerBalanceChart').then((m) => ({ default: m.PowerBalanceChart })))
const MultiPersonaChart = lazy(() => import('./components/charts/MultiPersonaChart').then((m) => ({ default: m.MultiPersonaChart })))
const IntelligenceDashboard = lazy(() => import('./components/ui/IntelligenceDashboard').then((m) => ({ default: m.IntelligenceDashboard })))
const SimulationDashboard = lazy(() => import('./components/ui/SimulationDashboard').then((m) => ({ default: m.SimulationDashboard })))
const SampleGalleryPanel = lazy(() => import('./components/ui/SampleGalleryPanel').then((m) => ({ default: m.SampleGalleryPanel })))
const AutoTunerPanel = lazy(() => import('./components/ui/AutoTunerPanel').then((m) => ({ default: m.AutoTunerPanel })))
const VersionHistoryPanel = lazy(() => import('./components/ui/VersionHistoryPanel').then((m) => ({ default: m.VersionHistoryPanel })))
const DiffViewerPanel = lazy(() => import('./components/ui/DiffViewerPanel').then((m) => ({ default: m.DiffViewerPanel })))
const CommunityLibraryPanel = lazy(() => import('./components/ui/CommunityLibraryPanel').then((m) => ({ default: m.CommunityLibraryPanel })))

function PanelFallback() {
  return <div className="p-6 text-xs text-muted">Loading…</div>
}

// 4 hlavní záložky místo 8
type Tab = 'editor' | 'analysis' | 'tuner' | 'library'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'editor',   label: 'Editor',   icon: '⬡' },
  { id: 'analysis', label: 'Analysis',  icon: '◎' },
  { id: 'tuner',    label: 'AutoTuner',icon: '⚙' },
  { id: 'library',  label: 'Library',  icon: '⊖' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('editor')
  const [libTab, setLibTab]       = useState<'samples' | 'export' | 'license' | 'history' | 'diff' | 'community'>('samples')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined)
  const { isPro } = useLicense()
  const { run, isRunning, error } = useSimulation()
  const setGraph = useGraphStore((s) => s.setGraph)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  useAutoSave()
  useVersionHistory()

  // Startup: load auto-saved graph if exists; jinak (opravdu první spuštění,
  // žádný autosave, prázdný graf) nabídnout onboarding — jen jednou, viz
  // WelcomeModal.tsx. V jednom efektu záměrně, ať nezávisí na pořadí dvou
  // oddělených efektů vůči Zustand re-renderu (loadAutoSave() se volá
  // synchronně, takže "saved" tady je vždy aktuální, na rozdíl od čtení
  // grafu ze store v odděleném efektu, které by mohlo běžet se starým stavem).
  useEffect(() => {
    const saved = loadAutoSave()
    if (saved && typeof saved === 'object' && 'nodes' in saved) {
      setGraph(saved as GSSGraph)
    } else if (!hasSeenWelcome()) {
      setWelcomeOpen(true)
    }
  }, [setGraph])

  // Listen for gss:open-settings custom event (from Intelligence Dashboard upgrade link)
  useEffect(() => {
    function onOpenSettings(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail) setSettingsSection(detail)
      setSettingsOpen(true)
    }
    document.addEventListener('gss:open-settings', onOpenSettings)
    return () => document.removeEventListener('gss:open-settings', onOpenSettings)
  }, [])


  return (
    <div className="flex flex-col h-screen bg-bg text-white font-sans overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 h-9 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-accent font-black text-sm tracking-[0.2em] uppercase select-none">GSS</span>
          <span className="text-white/20 text-[10px] select-none">v{APP_VERSION}</span>
        </div>
        <div className="flex items-center gap-2">
          {isPro ? (
            <span className="px-2 py-0.5 bg-accent/20 text-accent text-[10px] rounded font-semibold">PRO</span>
          ) : (
            <span className="px-2 py-0.5 bg-white/5 text-white/30 text-[10px] rounded">FREE</span>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
            className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-colors text-sm"
          >⚙</button>
        </div>
      </header>

      {/* ── Update banner (real check/download/install — desktop only, see UpdateBanner.tsx) ── */}
      <UpdateBanner />

      {/* ── Toolbar (always visible) ── */}
      <Toolbar onRun={run} isRunning={isRunning} />

      {/* ── Tab nav ── */}
      <nav className="flex items-center gap-0.5 px-3 h-8 bg-card border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-accent text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <span className="text-[11px] opacity-70">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* EDITOR TAB */}
        {activeTab === 'editor' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {error && (
              <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs shrink-0">
                {error}
              </div>
            )}
            {/* Graph workspace: Palette + Canvas */}
            <div className="flex flex-1 overflow-hidden">
              <NodePalette />
              <div className="flex-1 overflow-hidden">
                <GraphEditor />
              </div>
            </div>
            {/* Bottom panels */}
            <div className="shrink-0 border-t border-border bg-card">
              <IssuesPanel />
              <ReplaySlider />
            </div>
          </div>
        )}

        {/* ANALÝZA TAB — Simulace + Grafy + Intelligence v jedné stránce */}
        {activeTab === 'analysis' && (
          <Suspense fallback={<PanelFallback />}>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              {/* Simulation controls */}
              <SimulationDashboard />

              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-card rounded-lg border border-border p-4">
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Wealth Over Time</h2>
                  <WealthOverTimeChart />
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Production Summary</h2>
                  <ProductionSummaryChart />
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">XP Curves</h2>
                  <XPCurveChart />
                </div>
                <ProGate feature="Power Balance Chart">
                  <div className="bg-card rounded-lg border border-border p-4">
                    <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Power Balance</h2>
                    <PowerBalanceChart />
                  </div>
                </ProGate>
              </div>

              {/* Multi-Persona Dashboard */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Player Personas — Wealth Over Time</h2>
                <MultiPersonaChart />
              </div>

              {/* Intelligence */}
              <IntelligenceDashboard />
            </div>
          </Suspense>
        )}

        {/* AUTOTUNER TAB */}
        {activeTab === 'tuner' && (
          <Suspense fallback={<PanelFallback />}>
            <div className="flex-1 overflow-auto p-4">
              <AutoTunerPanel />
            </div>
          </Suspense>
        )}

        {/* KNIHOVNA TAB — sub-tabs: Vzory / Export / Licence */}
        {activeTab === 'library' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Sub-tab bar */}
            <div className="flex gap-1 px-4 py-2 bg-card border-b border-border shrink-0">
              {(['samples', 'export', 'history', 'diff', 'community', 'license'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLibTab(t)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    libTab === t ? 'bg-accent/20 text-accent' : 'text-white/40 hover:text-white hover:bg-border'
                  }`}
                >
                  {t === 'samples' ? '📂 Samples' : t === 'export' ? '↗ Export' : t === 'history' ? '📜 History' : t === 'diff' ? '⇄ Diff' : t === 'community' ? '🌐 Community' : '🔑 License'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-4">
              <Suspense fallback={<PanelFallback />}>
                {libTab === 'samples'  && <SampleGalleryPanel onClose={() => setActiveTab('editor')} />}
                {libTab === 'export'   && <ExportPanel />}
                {libTab === 'history'  && <VersionHistoryPanel />}
                {libTab === 'diff'     && <DiffViewerPanel />}
                {libTab === 'community' && <CommunityLibraryPanel />}
                {libTab === 'license'  && <LicensePanel />}
              </Suspense>
            </div>
          </div>
        )}
      </div>

      {/* ── Status Bar (vždy viditelný) ── */}
      <StatusBar />

      {/* ── Settings Modal ── */}
      <SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); setSettingsSection(undefined) }} initialSection={settingsSection} />
      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette
        onRun={run}
        onTabChange={(t) => setActiveTab(t as Tab)}
        onLibTabChange={(t) => { setActiveTab('library'); setLibTab(t as 'samples' | 'export' | 'license' | 'history') }}
      />
    </div>
  )
}
