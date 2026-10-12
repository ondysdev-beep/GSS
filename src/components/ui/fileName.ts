// fileName.ts — safe default file names for save/export dialogs.

/**
 * File-system safe base name from a graph name: strips characters Windows and
 * macOS forbid (\ / : * ? " < > |), control characters and spaces. Dřív se
 * nahrazovaly jen mezery, takže např. "Shop v1/v2" nabídlo neplatnou cestu.
 */
export function safeFileBaseName(name: unknown, fallback = 'graph'): string {
  const base = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 100)
  return base || fallback
}
