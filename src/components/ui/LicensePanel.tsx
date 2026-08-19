// LicensePanel — shows current edition (FREE/PRO) and feature comparison.
//
// No runtime license key anymore (see hooks/useLicense.ts) — PRO/FREE is
// decided by which build you downloaded, not by anything entered here.
// This panel is purely informational now: what you have, what PRO adds,
// and where to get it.

import { useLicense } from '../../hooks/useLicense'
import { ITCH_URL } from '../../core/UpdateChecker'
import { FREE_TIER_LIMITS } from '../../types/simulation'
import { platform } from '../../platform'

const FREE_FEATURES = [
  `Up to ${FREE_TIER_LIMITS.MAX_NODES} nodes`,
  `Up to ${FREE_TIER_LIMITS.MAX_TICKS} simulation ticks`,
  'All 10 node types (try everything)',
  'Basic simulation & charts',
  'Health score overview',
  '.gss save / load',
  'Sample gallery + Community Library',
]

const PRO_FEATURES = [
  { label: 'Unlimited nodes & simulation duration',        hot: true  },
  { label: 'Full Intelligence Dashboard',                  hot: true  },
  { label: '  ↳ Bottleneck & exploit detection',           hot: false },
  { label: '  ↳ RNG psychology & fairness analysis',       hot: false },
  { label: 'AutoTuner — AI economy balancing',             hot: true  },
  { label: 'A/B Scenario Comparison',                      hot: false },
  { label: 'Monte Carlo simulation',                       hot: false },
  { label: 'Code export: C# · GDScript · TypeScript',      hot: true  },
  { label: 'PDF Report + Web Share HTML',                  hot: false },
  { label: 'Version history (unlimited snapshots)',         hot: false },
  { label: 'Priority support',                             hot: false },
]

export function LicensePanel() {
  const { isPro, isLoading } = useLicense()

  if (isLoading) {
    return <div className="text-xs text-muted">Checking edition…</div>
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">

      {/* ── Current edition ── */}
      {isPro ? (
        <div className="flex items-center gap-2 p-4 bg-accent/10 border border-accent/30 rounded-xl">
          <span className="px-2 py-0.5 bg-accent text-[#0a0a14] text-[10px] font-black rounded">PRO</span>
          <span className="text-white font-semibold text-sm">You're running the PRO build — thank you! ✨</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 bg-card border border-border rounded-xl">
          <span className="px-2 py-0.5 bg-white/10 text-white/60 text-[10px] font-black rounded">FREE</span>
          <span className="text-white/70 text-sm">You're running the FREE build.</span>
        </div>
      )}

      {/* ── Free vs PRO comparison ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-card border border-border rounded-lg flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Free</div>
          {FREE_FEATURES.map((f) => (
            <div key={f} className="flex items-start gap-1.5 text-[11px] text-white/40">
              <span className="text-white/20 shrink-0 mt-0.5">○</span>{f}
            </div>
          ))}
        </div>
        <div className="p-3 bg-accent/5 border border-accent/25 rounded-lg flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-widest text-accent font-semibold">PRO ⭐</div>
          {PRO_FEATURES.map((f) => (
            <div key={f.label} className={`flex items-start gap-1.5 text-[11px] ${f.hot ? 'text-white/80' : 'text-white/40'}`}>
              <span className={`shrink-0 mt-0.5 ${f.hot ? 'text-accent' : 'text-accent/40'}`}>✓</span>
              {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Get PRO — separate download, no key entry. Web editions are two
           separate builds picked by which URL you're on (/ vs /pro); desktop
           PRO is a separate installer from the FREE one. Either way, there
           is nothing to type here — see SECURITY.md "PRO/FREE gating". */}
      {!isPro && (
        <div className="flex flex-col gap-2 pt-1 items-center text-center">
          <p className="text-xs text-white/50">
            {platform.name === 'web'
              ? <>Want PRO? Try the PRO web version, or grab the PRO desktop app on itch.io.</>
              : <>PRO is a separate download — no key to enter, just grab the PRO installer.</>}
          </p>
          <a
            href={ITCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-5 py-3 bg-accent hover:bg-accent/80 text-[#0a0a14] font-black rounded-xl text-sm transition-colors shadow-lg shadow-accent/20 uppercase tracking-wider"
          >
            🎮 Get GSS PRO on itch.io
          </a>
        </div>
      )}
    </div>
  )
}
