// fileName.ts — safe default file names for save/export dialogs.

/**
 * File-system safe base name from a graph name: strips characters Windows and
 * macOS forbid (\ / : * ? " < > |), control characters and spaces. Dřív se
 * nahrazovaly jen mezery, takže např. "Shop v1/v2" nabídlo neplatnou cestu.
 */
export function safeFileBaseName(name: unknown, fallback = 'graph'): string {
  // Řídicí znaky (kód < 32) se odfiltrují bez regexu — ESLint no-control-regex.
  const printable = Array.from(String(name ?? ''), (ch) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('')
  const base = printable
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 100)
  return base || fallback
}
