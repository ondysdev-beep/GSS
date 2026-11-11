// formatNumber.ts — compact display of the large numbers idle economies reach
// (1.2K, 3.4M, 5.6B, 7.8T, then 1.23e15). Display only — never used for data.

const SUFFIXES = ['', 'K', 'M', 'B', 'T']

/** 1234 → "1.23K", 0.5 → "0.5", 1e18 → "1e18". */
export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v)
  const abs = Math.abs(v)
  if (abs < 1000) return trim(abs >= 100 ? v.toFixed(0) : v.toPrecision(digits))
  const tier = Math.floor(Math.log10(abs) / 3)
  if (tier < SUFFIXES.length) {
    let scaled = v / 10 ** (tier * 3)
    // 999.96K se zaokrouhlí na "1000K" — posunout o řád výš.
    if (Math.abs(Number(scaled.toPrecision(digits))) >= 1000 && tier + 1 < SUFFIXES.length) {
      return trim((v / 10 ** ((tier + 1) * 3)).toPrecision(digits)) + SUFFIXES[tier + 1]
    }
    scaled = Number(scaled.toPrecision(digits))
    return trim(String(scaled)) + SUFFIXES[tier]
  }
  const [mantissa, exp] = v.toExponential(digits - 1).split('e')
  return `${trim(mantissa)}e${Number(exp)}`
}

/** Multiplier label: 1.5 → "1.5", 2 → "2", 1234.5 → "1.23K". */
export function formatMultiplier(m: number): string {
  return m < 1000 ? trim(m.toFixed(m < 10 ? 2 : 1)) : formatNumber(m)
}

/** Simulated seconds as a readable duration: 45 → "45s", 725 → "12m 05s", 12000 → "3h 20m", 190000 → "2d 4h". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${trim(seconds.toFixed(seconds < 10 ? 1 : 0))}s`
  const s = Math.round(seconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

function trim(s: string): string {
  return s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s
}
