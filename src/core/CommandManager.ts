// CommandManager.ts — Undo/Redo stack pro GSS
// Ukládá snapshoty GSSGraph stavu, umožňuje undo/redo operace.

import type { GSSGraph } from '../types/graph'

const MAX_HISTORY = 50

export interface CommandManagerState {
  history: GSSGraph[]
  cursor: number       // index posledního uloženého stavu (undo jde na cursor-1)
}

function createState(): CommandManagerState {
  return { history: [], cursor: -1 }
}

/** Singleton instance — sdílena přes graphStore */
let _state: CommandManagerState = createState()

export const CommandManager = {
  /** Zaznamenat nový snapshot po každé mutaci grafu */
  push(graph: GSSGraph): void {
    // Oříznout future stavy pokud undo proběhlo a pak byla provedena nová akce
    _state.history = _state.history.slice(0, _state.cursor + 1)
    _state.history.push(deepClone(graph))

    // Limit délky history
    if (_state.history.length > MAX_HISTORY) {
      _state.history.shift()
    }
    _state.cursor = _state.history.length - 1
  },

  /** Vrátit předchozí stav. Vrátí null pokud není co undo-ovat. */
  undo(): GSSGraph | null {
    if (_state.cursor <= 0) return null
    _state.cursor--
    return deepClone(_state.history[_state.cursor])
  },

  /** Znovu provést redo. Vrátí null pokud není co redo-ovat. */
  redo(): GSSGraph | null {
    if (_state.cursor >= _state.history.length - 1) return null
    _state.cursor++
    return deepClone(_state.history[_state.cursor])
  },

  canUndo(): boolean { return _state.cursor > 0 },
  canRedo(): boolean { return _state.cursor < _state.history.length - 1 },
  historyLength(): number { return _state.history.length },

  /** Reset při načtení nového grafu */
  reset(graph?: GSSGraph): void {
    _state = createState()
    if (graph) {
      _state.history.push(deepClone(graph))
      _state.cursor = 0
    }
  },
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
