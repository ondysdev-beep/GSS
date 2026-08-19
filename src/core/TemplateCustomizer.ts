// TemplateCustomizer.ts — Template Wizard (Fáze 6 nových funkcí).
//
// Pure funkce: vezme graf ze `GraphTemplates.ts` a vrátí novou, upravenou
// kopii — přejmenuje primární resource (aby odpovídal měně konkrétní hry,
// např. "gold" → "Crystals") a přeškáluje čísla (rychlosti/kapacity), aniž
// by se měnila struktura/topologie grafu. Nepřepisuje GraphTemplates.ts
// ani nezavádí druhý systém šablon — je to tenká vrstva nad existujícím.

import type { GSSGraph, GSSNode } from '../types/graph'

export type TemplateScale = 'small' | 'medium' | 'large'

const SCALE_FACTORS: Record<TemplateScale, number> = {
  small: 0.5,
  medium: 1,
  large: 2,
}

export interface TemplateCustomizeOptions {
  renameFrom: string
  renameTo: string
  scale: TemplateScale
}

// Pole, u kterých má smysl číselné škálování (rychlosti/kapacity/objemy).
// Netýká se pravděpodobnostních/poměrových polí (success_chance, split_mode…).
const SCALABLE_FIELDS = new Set([
  'rate', 'capacity', 'initial_amount',
  'input_amount', 'output_amount',
  'amount', 'value',
])

// Pole, jejichž string hodnota může referencovat název resource (viz Gate's
// `variable`, které dělá totéž — total podle jména resource napříč pooly).
const RESOURCE_NAME_FIELDS = new Set([
  'resource', 'input_resource', 'output_resource', 'variable',
])

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renameInExpression(expression: string, from: string, to: string): string {
  // Oprava B6: Formula uzel referencuje resource jménem přímo uvnitř
  // textu výrazu (např. "gold * 1.2"), ne přes samostatné pole jako ostatní
  // typy uzlů — bez tohoto kroku by přejmenování resource nechalo výraz
  // odkazovat na už neexistující jméno a FormulaEvaluator by ho tiše
  // vyhodnotil jako neznámou proměnnou (= 0). `\b` hranice slova zabraňuje
  // nechtěné shodě uvnitř jiného identifikátoru (např. "gold" v "goldfish").
  if (!from.trim()) return expression
  const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g')
  return expression.replace(pattern, to)
}

function customizeNode(node: GSSNode, opts: TemplateCustomizeOptions): GSSNode {
  const data = { ...(node.data as unknown as Record<string, unknown>) }
  const factor = SCALE_FACTORS[opts.scale]
  const renameTo = opts.renameTo.trim() !== '' ? opts.renameTo : null

  for (const key of Object.keys(data)) {
    const val = data[key]
    if (RESOURCE_NAME_FIELDS.has(key) && val === opts.renameFrom && renameTo) {
      data[key] = renameTo
    } else if (key === 'expression' && typeof val === 'string' && renameTo) {
      data[key] = renameInExpression(val, opts.renameFrom, renameTo)
    } else if (SCALABLE_FIELDS.has(key) && typeof val === 'number') {
      // Zaokrouhleno na 2 desetinná místa — zabraňuje plovoucím
      // artefaktům typu 4.999999999 po vynásobení faktorem 0.5.
      data[key] = Math.round(val * factor * 100) / 100
    }
  }

  return { ...node, data: data as unknown as GSSNode['data'] }
}

export function customizeTemplate(graph: GSSGraph, opts: TemplateCustomizeOptions): GSSGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => customizeNode(n, opts)),
  }
}
