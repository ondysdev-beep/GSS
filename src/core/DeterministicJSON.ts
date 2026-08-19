// DeterministicJSON.ts — port GDScript DeterministicJSON.gd
// Deterministická JSON serializace: seřazené klíče slovníků, stabilní řazení polí.

/** Serializuje hodnotu do deterministického JSON stringu s odsazením \t */
export function stringify(value: unknown, indent = '\t'): string {
  return serialize(value, indent, 0)
}

type AnyObj = Record<string, unknown>

/** Speciální variantra pro GSSGraph — seřadí nodes, connections, scenarios, personas */
export function stringifyGraph(graph: unknown): string {
  const gd = JSON.parse(JSON.stringify(graph)) as AnyObj

  if (Array.isArray(gd['nodes'])) {
    gd['nodes'] = (gd['nodes'] as AnyObj[]).slice().sort((a, b) =>
      String(a['id'] ?? '') < String(b['id'] ?? '') ? -1 : 1)
  }
  if (Array.isArray(gd['connections'])) {
    gd['connections'] = (gd['connections'] as AnyObj[]).slice().sort((a, b) => {
      const ka = `${a['from_node']}:${a['from_port']}:${a['to_node']}:${a['to_port']}`
      const kb = `${b['from_node']}:${b['from_port']}:${b['to_node']}:${b['to_port']}`
      return ka < kb ? -1 : 1
    })
  }
  if (Array.isArray(gd['scenarios'])) {
    gd['scenarios'] = (gd['scenarios'] as AnyObj[]).slice().sort((a, b) =>
      String(a['name'] ?? '') < String(b['name'] ?? '') ? -1 : 1)
  }
  if (Array.isArray(gd['personas'])) {
    gd['personas'] = (gd['personas'] as AnyObj[]).slice().sort((a, b) =>
      String(a['name'] ?? '') < String(b['name'] ?? '') ? -1 : 1)
  }

  return stringify(gd)
}

// ==================== INTERNÍ SERIALIZACE ====================

function serialize(value: unknown, indent: string, depth: number): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') return escapeString(value)
  if (Array.isArray(value))      return serializeArray(value, indent, depth)
  if (typeof value === 'object') return serializeObject(value as Record<string, unknown>, indent, depth)
  return JSON.stringify(value)
}

function formatNumber(v: number): string {
  if (!isFinite(v)) return v > 0 ? '1e308' : '-1e308'
  if (isNaN(v)) return '0'
  // Čísla bez zbytečných nul (max 6 des. míst)
  if (Number.isInteger(v)) return String(v)
  let s = v.toFixed(6)
  while (s.endsWith('0') && !s.endsWith('.0')) s = s.slice(0, -1)
  return s
}

function escapeString(s: string): string {
  return JSON.stringify(s) // Nativní JSON.stringify správně escapuje
}

function serializeObject(obj: Record<string, unknown>, indent: string, depth: number): string {
  const keys = Object.keys(obj).sort()
  if (keys.length === 0) return '{}'

  const innerIndent = indent.repeat(depth + 1)
  const outerIndent = indent.repeat(depth)
  const lines = keys.map((k) => `${innerIndent}${escapeString(k)}: ${serialize(obj[k], indent, depth + 1)}`)
  return `{\n${lines.join(',\n')}\n${outerIndent}}`
}

function serializeArray(arr: unknown[], indent: string, depth: number): string {
  if (arr.length === 0) return '[]'

  // Krátká jednoduchá pole inline
  const allSimple = arr.every((item) => typeof item !== 'object' || item === null)
  if (allSimple && arr.length <= 8) {
    return `[${arr.map((item) => serialize(item, indent, depth + 1)).join(', ')}]`
  }

  const innerIndent = indent.repeat(depth + 1)
  const outerIndent = indent.repeat(depth)
  const lines = arr.map((item) => `${innerIndent}${serialize(item, indent, depth + 1)}`)
  return `[\n${lines.join(',\n')}\n${outerIndent}]`
}
