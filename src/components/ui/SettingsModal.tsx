// SettingsModal.tsx — Application settings overlay

import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useLicense } from '../../hooks/useLicense'
import { APP_VERSION, ITCH_URL, GITHUB_URL } from '../../core/UpdateChecker'
import { FREE_TIER_LIMITS } from '../../types/simulation'
import { hasAnthropicApiKey, saveAnthropicApiKey, clearAnthropicApiKey } from '../../core/EconomyGenerator'

type Section = 'license' | 'editor' | 'simulation' | 'ai' | 'about'

interface Props {
  open: boolean
  onClose: () => void
  initialSection?: string
}

export function SettingsModal({ open, onClose, initialSection }: Props) {
  const [section, setSection] = useState<Section>((initialSection as Section) || 'editor')

  // Update section when initialSection changes
  useEffect(() => {
    if (initialSection && ['license', 'editor', 'simulation', 'ai', 'about'].includes(initialSection)) {
      setSection(initialSection as Section)
    }
  }, [initialSection])
  const { settings, update, reset } = useSettingsStore()
  const { isPro } = useLicense()

  // AI Generator API key state
  const [aiKeyConfigured, setAiKeyConfigured] = useState<boolean | null>(null)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiKeyMsg, setAiKeyMsg] = useState<string | null>(null)
  const [aiKeyBusy, setAiKeyBusy] = useState(false)

  useEffect(() => {
    if (open) hasAnthropicApiKey().then(setAiKeyConfigured).catch(() => setAiKeyConfigured(false))
  }, [open])

  async function handleSaveAiKey() {
    if (!aiKeyInput.trim()) return
    setAiKeyBusy(true)
    setAiKeyMsg(null)
    try {
      await saveAnthropicApiKey(aiKeyInput.trim())
      setAiKeyInput('')
      setAiKeyConfigured(true)
      setAiKeyMsg('✓ Key saved locally.')
    } catch (err) {
      setAiKeyMsg(`Failed to save key: ${err}`)
    } finally {
      setAiKeyBusy(false)
    }
  }

  async function handleClearAiKey() {
    setAiKeyBusy(true)
    try {
      await clearAnthropicApiKey()
      setAiKeyConfigured(false)
      setAiKeyMsg('Key removed.')
    } finally {
      setAiKeyBusy(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!open) return null

  const SECTIONS: { id: Section; label: string; icon: string }[] = [
    { id: 'editor', label: 'Editor', icon: '⬡' },
    { id: 'simulation', label: 'Simulation', icon: '◎' },
    { id: 'ai', label: 'AI Generator', icon: '✨' },
    { id: 'license', label: 'License', icon: '🔑' },
    { id: 'about', label: 'About', icon: 'ℹ' },
  ]

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[680px] max-h-[80vh] bg-[#111118] border border-border rounded-xl shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sidebar ── */}
        <div className="w-44 shrink-0 bg-card border-r border-border flex flex-col py-3 gap-0.5">
          <div className="px-4 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Settings</span>
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs transition-colors text-left ${section === s.id
                ? 'bg-accent/10 text-accent border-r-2 border-accent'
                : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="text-sm">{s.icon}</span>
              {s.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => { if (confirm('Reset all settings to defaults?')) reset() }}
            className="mx-3 mb-2 px-3 py-1.5 text-[10px] text-white/30 hover:text-white/60 border border-white/10 hover:border-white/20 rounded transition-colors"
          >
            Reset to defaults
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-white">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            <button onClick={onClose} aria-label="Close settings" className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

            {/* ── EDITOR ── */}
            {section === 'editor' && (
              <>
                <SettingToggle
                  label="Snap to grid"
                  description="Align nodes to a grid when dragging"
                  value={settings.snapToGrid}
                  onChange={(v) => update({ snapToGrid: v })}
                />
                {settings.snapToGrid && (
                  <SettingSelect
                    label="Grid size"
                    value={String(settings.gridSize)}
                    options={[{ value: '10', label: '10 px' }, { value: '20', label: '20 px' }, { value: '40', label: '40 px' }]}
                    onChange={(v) => update({ gridSize: Number(v) })}
                  />
                )}
                <SettingToggle
                  label="Show minimap"
                  description="Overview map in the bottom-right corner of the editor"
                  value={settings.showMinimap}
                  onChange={(v) => update({ showMinimap: v })}
                />
                <SettingToggle
                  label="Show node subtitles"
                  description="Display parameter summary below node labels"
                  value={settings.showNodeSubtitles}
                  onChange={(v) => update({ showNodeSubtitles: v })}
                />
                <SettingToggle
                  label="Performance mode"
                  description="Disable flow labels, heatmap glow, and minimap during simulation for better performance"
                  value={settings.performanceMode}
                  onChange={(v) => update({ performanceMode: v })}
                />
                <SettingSelect
                  label="Auto-save interval"
                  description="How often to auto-save to local backup"
                  value={String(settings.autoSaveIntervalMs)}
                  options={[
                    { value: '0', label: 'Disabled' },
                    { value: '15000', label: '15 seconds' },
                    { value: '30000', label: '30 seconds' },
                    { value: '60000', label: '1 minute' },
                    { value: '300000', label: '5 minutes' },
                  ]}
                  onChange={(v) => update({ autoSaveIntervalMs: Number(v) })}
                />
                <SettingSelect
                  label="Edge style"
                  description="Visual style of connections between nodes"
                  value={settings.edgeStyle}
                  options={[
                    { value: 'default', label: 'Bezier (smooth curves)' },
                    { value: 'straight', label: 'Straight lines' },
                    { value: 'step', label: 'Step (right-angle)' },
                  ]}
                  onChange={(v) => update({ edgeStyle: v as 'default' | 'straight' | 'step' })}
                />
              </>
            )}

            {/* ── SIMULATION ── */}
            {section === 'simulation' && (
              <>
                <SettingNumber
                  label="Default duration"
                  description="Number of ticks for new simulations"
                  value={settings.defaultDuration}
                  min={10} max={3600} step={10}
                  unit="ticks"
                  onChange={(v) => update({ defaultDuration: v })}
                />
                <SettingNumber
                  label="Default Δt (tick delta)"
                  description="Time step per tick in seconds"
                  value={settings.defaultDt}
                  min={0.1} max={10} step={0.1}
                  unit="s / tick"
                  onChange={(v) => update({ defaultDt: v })}
                />
                <SettingNumber
                  label="Default seed"
                  description="RNG seed for reproducible simulations (0 = random)"
                  value={settings.defaultSeed}
                  min={0} max={999999} step={1}
                  unit=""
                  onChange={(v) => update({ defaultSeed: v })}
                />
              </>
            )}

            {/* ── AI GENERATOR ── */}
            {section === 'ai' && (
              <>
                <p className="text-xs text-white/50 leading-relaxed">
                  AI Economy Generator uses <strong className="text-white/70">your own</strong> Anthropic API key — GSS has no AI backend of its own and never sends your key anywhere except <code className="text-white/60">api.anthropic.com</code>. The call goes straight from the desktop app, not through any GSS server, so API costs go to your own account.
                </p>

                <div className={`p-3 rounded-lg border ${aiKeyConfigured ? 'bg-accent/10 border-accent/30' : 'bg-white/5 border-border'}`}>
                  <span className={`text-xs font-semibold ${aiKeyConfigured ? 'text-accent' : 'text-white/50'}`}>
                    {aiKeyConfigured === null ? 'Checking status…' : aiKeyConfigured ? '✓ API key configured' : '○ API key not set'}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-white/60 font-medium">
                    {aiKeyConfigured ? 'Replace saved key' : 'Anthropic API key'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={aiKeyInput}
                      onChange={(e) => setAiKeyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAiKey() }}
                      placeholder="sk-ant-…"
                      className="flex-1 bg-bg border border-border rounded px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-accent/50 transition-colors"
                    />
                    <button
                      onClick={handleSaveAiKey}
                      disabled={aiKeyBusy || !aiKeyInput.trim()}
                      className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent text-xs rounded transition-colors disabled:opacity-40"
                    >
                      {aiKeyBusy ? '…' : 'Save'}
                    </button>
                  </div>
                  {aiKeyMsg && <p className="text-xs text-white/50">{aiKeyMsg}</p>}
                  {aiKeyConfigured && (
                    <button
                      onClick={handleClearAiKey}
                      disabled={aiKeyBusy}
                      className="self-start px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/20 transition-colors"
                    >
                      Remove key from this device
                    </button>
                  )}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent/70 hover:text-accent underline"
                  >
                    Get an API key at console.anthropic.com →
                  </a>
                </div>

                <details className="group">
                  <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50 transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                    How the key is stored and used
                  </summary>
                  <div className="mt-2 p-3 bg-white/5 rounded text-[10px] text-white/40 leading-relaxed space-y-1">
                    <p>1. The key is stored locally in an encrypted store file (<code>gss.bin</code>) — never in browser <code>localStorage</code></p>
                    <p>2. After saving, the frontend never asks for the value again — only whether one is set</p>
                    <p>3. Calls to the Anthropic API happen entirely from the Rust side of the app, never from the WebView</p>
                    <p>4. Generated graphs always go through the same validation as manual edits — a bad model response is never silently loaded into the editor</p>
                  </div>
                </details>
              </>
            )}

            {/* ── LICENSE ── */}
            {section === 'license' && (
              <>
                {/* Current status */}
                <div className={`p-4 rounded-lg border ${isPro ? 'bg-accent/10 border-accent/30' : 'bg-white/5 border-border'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${isPro ? 'text-accent' : 'text-white/50'}`}>
                      {isPro ? '⭐ GSS PRO' : '○ GSS FREE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/40">
                    {isPro
                      ? "You're running the PRO build. Thanks for supporting GSS!"
                      : `Free tier: max ${FREE_TIER_LIMITS.MAX_NODES} nodes, ${FREE_TIER_LIMITS.MAX_TICKS} ticks. Upgrade to unlock all features.`}
                  </p>
                </div>

                {/* Get PRO — no key entry, PRO is a separate build/download */}
                {!isPro && (
                  <a
                    href={ITCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start text-xs text-accent/70 hover:text-accent underline"
                  >
                    Get PRO on itch.io →
                  </a>
                )}

                {/* How it works */}
                <details className="group">
                  <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50 transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                    How FREE/PRO works
                  </summary>
                  <div className="mt-2 p-3 bg-white/5 rounded text-[10px] text-white/40 leading-relaxed space-y-1">
                    <p>GSS doesn't use a runtime license key. FREE and PRO are separate downloads/builds — which one you're running is decided at build time, not by anything you enter here.</p>
                    <p>If you'd like PRO, download the PRO installer (desktop) or use the PRO web version — see the link above.</p>
                  </div>
                </details>
              </>
            )}

            {/* ── ABOUT ── */}
            {section === 'about' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-accent font-black text-2xl tracking-[0.2em]">GSS</span>
                  <div>
                    <div className="text-sm font-semibold text-white">Game Systems Simulator</div>
                    <div className="text-xs text-white/40">Version {APP_VERSION}</div>
                  </div>
                </div>

                <p className="text-xs text-white/50 leading-relaxed">
                  Node-based economy designer and simulator for game developers. Build resource flow graphs, detect exploits, balance your game economy, and export ready-to-use code.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'GitHub', url: GITHUB_URL, icon: '⭐' },
                    { label: 'Get PRO', url: ITCH_URL, icon: '🎮' },
                    { label: 'DEVLOG', url: `${GITHUB_URL}/blob/master/DEVLOG.md`, icon: '📋' },
                    { label: 'Releases', url: `${GITHUB_URL}/releases`, icon: '📦' },
                  ].map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 bg-card border border-border rounded-lg hover:border-white/20 text-xs text-white/60 hover:text-white transition-colors"
                    >
                      <span>{link.icon}</span>
                      {link.label}
                    </a>
                  ))}
                </div>

                <div className="flex flex-col gap-1 text-[10px] text-white/25 border-t border-border pt-3">
                  <div>Built with Tauri 2 · React 18 · TypeScript · ReactFlow · Zustand</div>
                  <div>© 2025-2026 neopryus · All rights reserved</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reusable setting row components ──────────────────────────────────────────

function SettingToggle({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-xs font-medium text-white">{label}</div>
        {description && <div className="text-[10px] text-white/35 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-accent' : 'bg-border'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}

function SettingSelect({ label, description, value, options, onChange }: {
  label: string; description?: string; value: string
  options: { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-xs font-medium text-white">{label}</div>
        {description && <div className="text-[10px] text-white/35 mt-0.5">{description}</div>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-card border border-border rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-accent/50 transition-colors shrink-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function SettingNumber({ label, description, value, min, max, step, unit, onChange }: {
  label: string; description?: string; value: number
  min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-xs font-medium text-white">{label}</div>
        {description && <div className="text-[10px] text-white/35 mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 bg-card border border-border rounded px-2 py-1 text-xs text-white/80 font-mono outline-none focus:border-accent/50 transition-colors text-right"
        />
        {unit && <span className="text-[10px] text-white/30 w-12">{unit}</span>}
      </div>
    </div>
  )
}
