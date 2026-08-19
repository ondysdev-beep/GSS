// ProGate.tsx — Wraps PRO-only features with upgrade overlay for Free users

import type { ReactNode } from 'react'
import { useLicenseStore } from '../../store/licenseStore'
import { ITCH_URL } from '../../core/UpdateChecker'

const PRO_HIGHLIGHTS = [
  'Unlimited nodes & simulation duration',
  'Full Intelligence Dashboard (bottlenecks, exploits, RNG)',
  'AutoTuner — AI-powered economy balancing',
  'A/B Scenario Comparison & Monte Carlo',
  'Code export: C# / GDScript / TypeScript',
  'PDF Report & Web Share',
  'Version history & snapshots',
]

interface ProGateProps {
  feature: string
  /** If true, renders children blurred behind the overlay instead of hiding them */
  preview?: boolean
  children?: ReactNode
}

export function ProGate({ feature, preview = true, children }: ProGateProps) {
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)

  if (isPro) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-lg">
      {preview && (
        <div className="pointer-events-none select-none opacity-20 blur-[2px]">
          {children}
        </div>
      )}
      <div
        className={`flex flex-col items-center justify-center gap-4 p-6 text-center
          bg-gradient-to-b from-[#0a0a14]/95 to-[#0a0a14]/98 border border-accent/20 rounded-lg
          ${preview ? 'absolute inset-0' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-accent font-black text-lg tracking-[0.2em]">GSS</span>
          <span className="px-2 py-0.5 bg-accent text-[#0a0a14] text-[10px] font-black rounded">PRO</span>
        </div>

        <div>
          <p className="text-white font-semibold text-sm mb-1">{feature}</p>
          <p className="text-white/40 text-xs">This feature is available in GSS PRO</p>
        </div>

        <div className="flex flex-col gap-1 w-full max-w-xs text-left">
          {PRO_HIGHLIGHTS.map((h) => (
            <div key={h} className="flex items-center gap-2 text-[10px] text-white/50">
              <span className="text-accent shrink-0">✓</span>
              {h}
            </div>
          ))}
        </div>

        <a
          href={ITCH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2.5 bg-accent hover:bg-accent/80 text-[#0a0a14] text-xs font-black rounded-lg transition-colors shadow-lg shadow-accent/20 uppercase tracking-wider"
        >
          Get PRO on itch.io →
        </a>
        <p className="text-[9px] text-white/25">Lifetime license · 3 device activations</p>
      </div>
    </div>
  )
}
