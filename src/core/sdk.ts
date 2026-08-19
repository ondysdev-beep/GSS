// sdk.ts — GSS SDK (Fáze 9 nových funkcí, poslední fáze).
//
// Veřejný, framework-nezávislý povrch simulačního jádra GSS. Vše, co se
// odsud exportuje, funguje beze změny v Node.js, v prohlížeči, nebo v
// jakémkoli jiném JS/TS prostředí — nic zde nezávisí na Reactu, Tauri ani
// Zustand (ověřeno greppem přes všechny importy před vytvořením tohoto
// souboru; viz sdk/README.md pro detaily a test níže, který dokazuje, že
// tento barrel export sám o sobě stačí ke spuštění celé simulace).
//
// Toto NENÍ samostatně publikovaný npm balíček — je to jasně vymezené
// veřejné API v rámci existujícího projektu, připravené k budoucí extrakci
// (`npm publish`) bez nutnosti cokoliv přepisovat. Publikace samotná je
// manuální krok mimo tuto session (vyžaduje npm účet vlastníka projektu).

// ── Simulace ──────────────────────────────────────────────────────────────
export { initState, simulateTick, getTickSpecDescription, getSemanticsNotes, TICK_SPEC_VERSION } from './TickEngine'
export { createRNG, SimRNG } from './SimRNG'
export type { RNGInstance } from './SimRNG'

// ── Validace ──────────────────────────────────────────────────────────────
export { validate, hasErrors, hasWarnings, formatIssue } from './GraphValidator'

// ── Bezpečný vyhodnocovač výrazů (Formula uzel) ────────────────────────────
export { evaluateFormula, validateFormulaSyntax } from './FormulaEvaluator'
export type { FormulaError } from './FormulaEvaluator'

// ── Scénáře a analýza ───────────────────────────────────────────────────────
export { runScenario, buildSimulationContext, reportToCSV } from './ScenarioRunner'
export { runMonteCarlo } from './MonteCarloSimulator'
export { runSweep } from './ParameterSweeper'
export { compareReports } from './ScenarioComparer'
export { diffGraphs, formatDiffChange } from './GraphDiffer'
export { calculateHealthScore } from './HealthScoreCalculator'
export { runPersonaSimulation, runAllPersonaSimulations, getAllPresets } from './PlayerPersona'

// ── Šablony ─────────────────────────────────────────────────────────────────
export { TEMPLATE_LIST, getTemplate } from './GraphTemplates'
export { customizeTemplate } from './TemplateCustomizer'

// ── Typy (grafový formát, simulační stav, výsledky) ─────────────────────────
export type { GSSGraph, GSSNode, GSSConnection, NodeData, NodeTypeValue } from '../types/graph'
export { NodeType, GSS_FORMAT_VERSION } from '../types/graph'
export type {
  SimState, PoolState, RunReport, HealthScore, ValidationIssue, Scenario,
} from '../types/simulation'
