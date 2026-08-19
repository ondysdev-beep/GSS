// Logger.ts — port GDScript Logger.gd
// Centralizované logování simulačních událostí.

export type LogType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'DEBUG' | 'SIMULATION' | 'ECONOMY' | 'NETWORK'

export interface LogEntry {
  type: LogType
  message: string
  timestamp: string
  time_ms: number
}

type LogListener = (entry: LogEntry) => void

const MAX_LOG_ENTRIES = 500

let _history: LogEntry[] = []
let _isPaused = false
let _filterTypes: LogType[] = []
let _listeners: LogListener[] = []

function getTimestamp(): string {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const Logger = {
  // ==================== CORE ====================

  emit(type: LogType, message: string): void {
    if (_isPaused) return
    if (_filterTypes.length > 0 && !_filterTypes.includes(type)) return

    const entry: LogEntry = {
      type,
      message,
      timestamp: getTimestamp(),
      time_ms: performance.now(),
    }

    _history.push(entry)
    while (_history.length > MAX_LOG_ENTRIES) _history.shift()

    for (const fn of _listeners) fn(entry)

    // Console output
    if (type === 'ERROR')        console.error(`[${entry.timestamp}][${type}] ${message}`)
    else if (type === 'WARNING') console.warn(`[${entry.timestamp}][${type}] ${message}`)
    else if (type === 'DEBUG')   console.debug(`[${entry.timestamp}][${type}] ${message}`)
    else                         console.log(`[${entry.timestamp}][${type}] ${message}`)
  },

  // ==================== ZKRATKY ====================

  info(msg: string)       { Logger.emit('INFO', msg) },
  warning(msg: string)    { Logger.emit('WARNING', msg) },
  error(msg: string)      { Logger.emit('ERROR', msg) },
  success(msg: string)    { Logger.emit('SUCCESS', msg) },
  debug(msg: string)      { Logger.emit('DEBUG', msg) },
  simulation(msg: string) { Logger.emit('SIMULATION', msg) },
  economy(msg: string)    { Logger.emit('ECONOMY', msg) },

  logValue(type: LogType, label: string, value: unknown): void {
    Logger.emit(type, `${label}: ${String(value)}`)
  },

  logTick(tick: number, data: Record<string, unknown>): void {
    const parts = Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`)
    Logger.emit('SIMULATION', `Tick ${tick} | ${parts.join(' | ')}`)
  },

  logNodeEvent(action: string, nodeName: string, details = ''): void {
    let msg = `[${action.toUpperCase()}] ${nodeName}`
    if (details) msg += ` - ${details}`
    Logger.emit('INFO', msg)
  },

  logTransaction(resource: string, amount: number, source: string): void {
    const prefix = amount >= 0 ? '+' : ''
    Logger.emit('ECONOMY', `${prefix}${amount} ${resource} (from ${source})`)
  },

  // ==================== HISTORY ====================

  getHistory(): LogEntry[] { return [..._history] },

  getHistoryByType(type: LogType): LogEntry[] {
    return _history.filter((e) => e.type === type)
  },

  getRecent(count = 50): LogEntry[] {
    return _history.slice(Math.max(0, _history.length - count))
  },

  clear(): void {
    _history = []
  },

  // ==================== OVLÁDÁNÍ ====================

  pause()  { _isPaused = true },
  resume() { _isPaused = false },
  setFilter(types: LogType[]) { _filterTypes = types },
  clearFilter() { _filterTypes = [] },

  // ==================== LISTENERY ====================

  addListener(fn: LogListener): () => void {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter((l) => l !== fn) }
  },

  // ==================== EXPORT ====================

  exportToString(): string {
    const header = `=== GSS Log Export ===\nExported: ${new Date().toISOString()}\nEntries: ${_history.length}\n\n`
    const lines = _history.map((e) => `[${e.timestamp}][${e.type}] ${e.message}`).join('\n')
    return header + lines
  },
}
