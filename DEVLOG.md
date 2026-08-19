# GSS Development Log

## v3.2.1 -- Bug Fixes, Tech Debt, and New Features

### Phase 1 -- Critical Bug Fixes (10 fixes)

| ID | File(s) | Description |
|---|---|---|
| 1.1 | `ScenarioRunner.ts`, `useSimulation.ts`, `AutoTunerPanel.tsx` | Health Score sub-scores (Fairness, Exploitability, Bottleneck) were always constant. Root cause: `buildSimulationContext()` returned empty `player_distribution` and `gate_times`. Fix: run persona simulations (Casual, Grinder, MinMaxer) inside `buildSimulationContext` and extract gate timing data from time series. |
| 1.2 | `AutoTunerPanel.tsx` | AutoTuner UI blocked the main thread and had no cancellation. Fix: converted hill climbing and random search to async generators with `setTimeout(0)` yield every 5 iterations, added Cancel button, and display seed in result summary. |
| 1.3 | `TickEngine.ts` | All gate nodes started closed on tick 0, even when conditions were already met. Fix: added gate pre-evaluation pass in `initState()` that checks initial pool amounts against gate conditions. |
| 1.4 | `TickEngine.ts` | Chance node fallback routing ignored port assignment, sending resources to the wrong output. Fix: corrected `_routeThroughChance` to respect success/failure port mapping in fallback path. |
| 1.5 | `SimRNG.ts`, `MonteCarloSimulator.ts` | Global `SimRNG` singleton caused non-determinism across concurrent runs. Fix: introduced `createRNG(seed)` factory returning isolated `RNGInstance` objects. Monte Carlo and ScenarioRunner now use local RNG instances. |
| 1.6 | `AutoTunerPanel.tsx` | AutoTuner UI used `Math.random()` instead of seeded RNG. Fix: replaced with `createRNG` instance seeded from config, displayed seed in results. |
| 1.7 | `ScenarioRunner.ts` | Floating-point accumulation in `elapsed += dt` caused drift over long simulations. Fix: switched to integer tick counter (`tickCount * dt`) for elapsed time calculation. |
| 1.8 | `UpdateChecker.ts`, `CommandPalette.tsx` | Update checker and GitHub links pointed to non-existent repository URL. Fix: centralized GitHub URL constant, made update checker URL configurable via environment variable. |
| 1.9 | `ExploitDiscovery.ts` | `calcProjections()` could produce `Infinity` when dividing by near-zero cycle times. Fix: clamped projection values to `Number.MAX_SAFE_INTEGER` and added zero-guard on divisors. |
| 1.10 | `ExploitDiscovery.ts` | `_exploitCounter` was never reset between runs, causing stale exploit IDs. Fix: added `resetExploitCounter()` call at the start of each discovery pass. |

### Phase 2 -- Tech Debt and Code Quality (4 fixes)

| ID | File(s) | Description |
|---|---|---|
| 2.1 | `core/autotuning/AutoTuner.ts` | Core AutoTuner module contained 8 instances of `Math.random()` across hill climbing, simulated annealing, random search, and helper functions. Fix: imported `createRNG` and threaded a deterministic RNG instance through all optimization methods. `mockSim` stub replaced with static deterministic values. |
| 2.2 | `SimRNG.ts` | `SimRNG.generateSeed()` used `Math.random()` for entropy. Fix: replaced with `crypto.getRandomValues(new Uint32Array(1))` with `Date.now()` fallback for environments without Web Crypto API. |
| 2.3 | `core/autotuning/AutoTuner.ts` | `runAutoTuner()` and all four optimization methods ran synchronously, blocking the main thread. Fix: converted to `async` functions with `CancellationToken` interface. Each method yields to the event loop every 5 iterations via `setTimeout(0)`. All callers now `await` the result. |
| 2.4 | Full codebase | Audit confirmed: zero `Math.random()` calls remain in production code (only in comments). Zero TypeScript errors. All 61 Vitest tests pass. |

### Phase 3 -- New Features (3 features)

#### 3.1 -- Live Flow Visualization

New file: `src/components/nodes/FlowEdge.tsx`

Custom ReactFlow edge component that displays real-time resource flow data during simulation replay:

- **Flow rate labels**: Each edge shows `X/t` (units per tick) at its midpoint during replay.
- **Intensity color-coding**: Edge color transitions from dim gray (no flow) through green shades to bright green (max flow), proportional to flow rate relative to the graph maximum.
- **Gate-blocked indicator**: Edges passing through closed gates render as dashed red lines with a cross mark label.
- **Flow computation**: `computeFlowData()` in `GraphEditor.tsx` estimates per-edge flow rates from source node rates, converter throughput, and pool deltas between consecutive time series frames.
- **Normalization**: All edge colors are normalized against the maximum flow rate across all edges for consistent visual comparison.

Changed files: `GraphEditor.tsx` (integrated `edgeTypes`, flow data computation, edge update on replay tick change).

#### 3.2 -- Performance Mode

Added `performanceMode: boolean` to `AppSettings` in `settingsStore.ts`.

When enabled:
- Flow rate labels and color-coded edges are disabled (plain edges shown instead).
- Heatmap glow effect is suppressed.
- Minimap is hidden during simulation.
- Reduces per-tick re-renders for smoother scrubbing on large graphs.

Toggle added to Settings Modal under a new "Performance mode" option with description.

Changed files: `settingsStore.ts`, `SettingsModal.tsx`, `GraphEditor.tsx`.

#### 3.3 -- Graph Search and Filtering

Search overlay accessible via `Ctrl+F` or the search button in the editor toolbar:

- **Search input**: Floating search bar in top-left corner of the editor canvas.
- **Match logic**: Searches node labels, type names (POOL, SOURCE, etc.), and node IDs. Case-insensitive substring match.
- **Visual feedback**: Matching nodes receive a blue glow highlight. Non-matching nodes are dimmed to 25% opacity with grayscale filter.
- **Match counter**: Displays `N/total` count next to the search input.
- **Keyboard shortcuts**: `Ctrl+F` to open and focus, `Escape` to close and clear.
- **Toolbar button**: Dedicated search toggle button in the top-right overlay toolbar with active state indicator.

Changed files: `GraphEditor.tsx` (search state, `useMemo` for match computation, highlight `useEffect`, keyboard handler, search bar UI, toolbar button).

### Test Results

All 61 Vitest tests pass across 8 test files:

- `HealthScoreCalculator.test.ts` -- 9 tests (fairness, exploitability, persona integration)
- `ExploitDiscovery.test.ts` -- 11 tests (projection clamping, overflow, counter reset, loop detection)
- `TickEngine.gate.test.ts` -- 7 tests (gate pre-evaluation, chance port routing, RNG determinism)
- `TickEngine.test.ts` -- 7 tests (tick counter, pool growth, capacity, purity, determinism)
- `createRNG.test.ts` -- 8 tests (interface, determinism, isolation, value ranges)
- `ScenarioRunner.test.ts` -- 6 tests (integer ticks, float drift, determinism, local RNG, sampling)
- `SimRNG.test.ts` -- 6 tests (determinism, ranges, seed management)
- `GraphValidator.test.ts` -- 7 tests (empty graph, duplicates, orphans, missing targets, negatives, chance range)

### Files Changed (Summary)

| File | Type |
|---|---|
| `src/core/SimRNG.ts` | Modified -- added `createRNG`, `RNGInstance`, crypto-based `generateSeed` |
| `src/core/TickEngine.ts` | Modified -- gate pre-eval, chance port fix, RNG param |
| `src/core/ScenarioRunner.ts` | Modified -- integer ticks, persona sims, gate_times extraction |
| `src/core/ExploitDiscovery.ts` | Modified -- projection clamping, counter reset |
| `src/core/UpdateChecker.ts` | Modified -- centralized URL, env var support |
| `src/core/MonteCarloSimulator.ts` | Modified -- local RNG instances |
| `src/core/autotuning/AutoTuner.ts` | Modified -- createRNG, async, CancellationToken |
| `src/components/ui/AutoTunerPanel.tsx` | Modified -- async optimizers, cancel button, seed display |
| `src/components/ui/CommandPalette.tsx` | Modified -- corrected GitHub URLs |
| `src/components/ui/SettingsModal.tsx` | Modified -- Performance Mode toggle |
| `src/components/nodes/FlowEdge.tsx` | New -- custom edge with flow rate labels |
| `src/components/nodes/GraphEditor.tsx` | Modified -- FlowEdge integration, search, perf mode |
| `src/hooks/useSimulation.ts` | Modified -- pass graph/scenario to context builder |
| `src/store/settingsStore.ts` | Modified -- added performanceMode field |
| `src/core/__tests__/*.test.ts` | New/Modified -- 61 tests across 8 files |

---

## v3.2.0 -- Mega Editor Update

### Editor Overhaul
- **Bug fixed**: NodePalette click now immediately renders the node on canvas (was requiring tab switch to appear)
- **Drag & drop**: Nodes can be dragged from the palette directly onto the canvas at any position
- **Ctrl+D**: Duplicate selected node with keyboard shortcut
- **Right-click on node**: Context menu with Duplicate and Delete actions (with keyboard hint labels)
- **Right-click on canvas**: "Add Node" context menu (translated to English from Czech)
- **Delete key**: Remove selected nodes/edges natively via ReactFlow

### Live Simulation Overlay
- **Animated edges**: Connections become animated (green glow) when simulation has been run
- **Live value badges**: Pool nodes show their current tick value as a colored badge during replay
- **Fill bar**: Pool nodes display a fill percentage bar based on capacity utilization
- **Gate indicators**: Gate nodes show open/closed state during replay

### Replay Controls
- **Play / Pause**: Auto-advance replay tick at selected speed
- **Step forward / Step back**: Move one tick at a time
- **Reset**: Jump to tick 0
- **Speed selector**: 0.5×, 1×, 2×, 5× playback speeds
- **Scrubber overlay**: Visual progress bar with click-to-seek

### Visual Enhancements
- **Heatmap mode** (🌡 button): Color nodes by peak simulation activity (blue→red gradient with glow)
- **Zoom to fit** (⊡ button): Fit entire graph in view with animation
- **Fullscreen mode** (⛶ button): Expand editor to fill entire screen, press ✕ to exit
- **Minimap**: Always-visible overview in bottom-right corner

### New Features
- **Command Palette** (Ctrl+K): Fuzzy search across all app actions — Run Simulation, New Graph, Undo/Redo, Navigate tabs, open Library sections, external links. Arrow keys + Enter navigation.
- **Auto-save**: Graph auto-saves to localStorage every 30 seconds when dirty
- **Version History** (Library → 🕐 History): Up to 20 snapshots per session, auto-snapshot every 5 minutes, manual save, one-click restore
- **PDF Report** (PRO): Print-optimized HTML report with pool data table and verdict — opens browser print dialog
- **Web Share** (PRO): Download a self-contained standalone `.html` file embedding graph structure and simulation results, shareable without installing GSS

### Fixes
- All remaining Czech UI strings translated to English (context menus, status messages, error messages)

---

## v3.1.0 — Tauri + React Port

### Overview
Complete rewrite of GSS from Godot 4 GDScript to a modern desktop application using **Tauri 2 + React 18 + TypeScript + Vite**. The application is now cross-platform, ships as a native binary, and exposes a significantly more capable analysis pipeline.

---

### What Changed from the Godot Version

#### Architecture
| Godot 3.0 | GSS 3.1 (Tauri) |
|---|---|
| GDScript + Godot scene tree | TypeScript + React 18 |
| Godot 4 export | Tauri 2 native binary (Windows/macOS/Linux) |
| Node-based UI in Godot | ReactFlow graph editor |
| GDScript simulation loop | Pure TypeScript tick engine |
| Godot signals | Zustand stores (reactive) |
| Godot save/load | Tauri `invoke` + OS file picker |

#### Core Engine Ports (GDScript → TypeScript)
- `ScenarioRunner.gd` → `src/core/ScenarioRunner.ts` — deterministic tick simulation, CSV export
- `TickEngine.gd` → embedded in ScenarioRunner — compiled graph path
- `HealthScoreCalculator.gd` → `src/core/HealthScoreCalculator.ts` — 5-dimension economy health (stability, convergence, fairness, exploitability, recovery)
- `VerdictSystem.gd` → `src/core/VerdictSystem.ts` — SAFE / CAUTION / UNSAFE / CRITICAL verdict
- `FailureDetectors.gd` → `src/core/FailureDetectors.ts` — infinite growth, economy collapse, deadlock detection
- `MonteCarloSimulator.gd` → `src/core/MonteCarloSimulator.ts` — N-iteration stochastic analysis with percentile statistics
- `ParameterSweeper.gd` → `src/core/ParameterSweeper.ts` — flexible parameter sweep with tornado chart
- `ScenarioComparer.gd` → `src/core/ScenarioComparer.ts` — A/B comparison of two run reports
- `GraphDiffer.gd` → `src/core/GraphDiffer.ts` — structural graph diff
- `PlayerPersona.gd` → `src/core/PlayerPersona.ts` — Casual / Grinder / MinMaxer archetypes
- `UpdateChecker.gd` → `src/core/UpdateChecker.ts` — semver comparison, version manifest fetch
- `SampleGallery.gd` → `src/core/SampleGallery.ts` — 12 sample project registry with `loadSample()`
- `CommandManager.gd` → `src/core/CommandManager.ts` — undo/redo stack (50 steps)
- `BottleneckAnalyzer.gd` → `src/core/BottleneckAnalyzer.ts` — bottleneck detection + "why empty?" trace
- `DiagnosticsExporter.gd` → `src/core/DiagnosticsExporter.ts` — bug report bundle
- `GraphModule.gd` → `src/core/GraphModule.ts` — subgraph module create/insert
- `GraphTemplates.gd` → `src/core/GraphTemplates.ts` — 5 built-in economy templates

#### New Features (Not in Godot Version)
- **Exploit Discovery** (`src/core/ExploitDiscovery.ts`) — automatic detection of conversion loops with gain multiplier, 10-cycle projection, and severity rating
- **RNG Psychology** (in `IntelligenceDashboard`) — statistical fairness analysis of chance nodes, rage-quit risk detection, deviation from expected probability
- **AutoTuner** (`src/components/ui/AutoTunerPanel.tsx`) — inline hill climbing + random search parameter optimizer targeting health score, stability, fairness, or convergence
- **RecommendationEngine** (`src/core/RecommendationEngine.ts`) — automated suggestions derived from VerdictReport
- **PRO License System** — Gumroad key validation via Tauri Rust backend, persisted across sessions
- **Startup License Re-validation** — on every launch, stored key is re-validated against Gumroad API
- **Auto-Update Check** — on every launch, fetches `version.json` from GitHub, shows dismissible banner if newer version exists

#### UI Redesign (v3.1.0)
- **4 tabs** (was 8): Editor | Analysis | AutoTuner | Library
  - **Editor**: Node palette (left sidebar) + ReactFlow canvas + Issues panel + Replay slider
  - **Analysis**: Simulation controls + 4 charts + full Intelligence Dashboard — all on one scrollable page
  - **AutoTuner**: standalone optimization panel
  - **Library**: Samples / Export / License (sub-tabs)
- **Node Palette** — left sidebar with all 7 node types; click to add to canvas
- **Persistent Status Bar** — always-visible bottom bar: verdict badge, health score gauge, stability/convergence/fairness micro-stats, node count, edge count, unsaved indicator, seed/duration
- **Dirty Indicator** — `●` next to graph name when unsaved changes exist; `beforeunload` warning on window close
- **Version in header** — reads from `APP_VERSION` constant in `UpdateChecker.ts`
- Full English UI (previously Czech)

#### Node Types Supported
| Type ID | Name | Description |
|---|---|---|
| 0 | Pool | Resource storage with capacity |
| 1 | Source | Generates resources at rate/s |
| 2 | Converter | Transforms one resource type to another |
| 3 | Drain | Consumes resources at rate/s |
| 4 | Gate | Conditional flow control (GT/LT/EQ/NEQ/GTE/LTE) |
| 5 | Chance | Probability branch (0–100%) |
| 7 | Splitter | Splits flow to multiple outputs by weight |

#### Exports (PRO)
- `.gss` JSON (free)
- CSV tick data (PRO)
- C# / Unity (PRO)
- GDScript / Godot 4 (PRO)
- TypeScript / Web (PRO)
- Diagnostics bundle JSON

#### Sample Projects (12 total)
`idle_tycoon`, `rpg_loot`, `dual_currency`, `energy_regen`, `gated_progression`, `splitter_economy`, `converter_chain`, `battle_pass`, `survival_hunger`, `stamina_loop`, `gacha_pull`, `resource_chain`

---

## v3.0.0 — Godot 4 (Previous)

### Godot 3.0 EPICs Completed
- **A1** AsyncSimRunner — background thread simulation with mutex safety
- **A2** CompiledGraph — pre-indexed graph structure for performance
- **B1** FlowOverlay — Off/Live/Replay resource flow visualization on canvas
- **B2** BottleneckAnalyzer — bottleneck detection + "Why empty?" trace-back
- **C1** GuidedTutorial — 2-minute interactive onboarding overlay
- **C2** SampleGallery — 12 sample projects across 7 genres
- **C3** DiagnosticsExporter — bug report bundle
- **D1/D2** GraphModule — create/save/load/insert subgraph modules
- **E1** DeterministicJSON — sorted-key serialization for reproducible saves
- **E2** FolderExporter — export/import as folder structure

### Key Godot Architecture
- `NodeGraphEditor.gd` — main scene with all simulation triggers, async runner, flow overlay, replay slider, bottleneck panel, tutorial, template gallery
- `TickEngine.gd` — `simulate_tick()` + `simulate_tick_compiled()` (250 lines)
- `ScenarioRunner.gd` — `run()` compiles graph; `run_compiled()` for reuse
- `MonteCarloSimulator.gd` — compile once, reuse across all MC runs

---

## Bug Fixes Applied During Port (v3.1.0)

| ID | File | Fix |
|---|---|---|
| P0 | `graphStore.ts` | Added `graphVersion` counter; `setConnections` now calls `CommandManager.push()` |
| P0 | `GraphEditor.tsx` | `useEffect` on `graphVersion` forces ReactFlow canvas sync after graph load |
| P0 | `GraphEditor.tsx` | Replaced deprecated `project()` with `screenToFlowPosition()` |
| P0 | `ExportPanel.tsx` | Added `save()` file picker dialog before `invoke('save_file')` |
| P1 | `SimulationDashboard.tsx` | Parameter Sweep: flexible node/field/min/max/steps selection (was hardcoded) |
| P2 | `Toolbar.tsx` | Dirty indicator `●` + `beforeunload` warning |

---

## Planned (v3.2.0)
- **Live Flow Visualization** — animated resource numbers on graph edges during simulation
- **AI Economy Generator** — text description → auto-generated economy graph (LLM integration)
- **Web Share Export** — standalone HTML export for stakeholder sharing (no install required)
- **Advanced Node Types** — Timer, Formula (custom expression), Player Action, Seasonal Event
- **Multi-Persona Dashboard** — Casual/Grinder/Whale simulated simultaneously with divergence chart
- **Economy Diff Viewer** — visual A/B diff of two graph versions with health impact
- **GSS SDK** — npm package + Godot 4 plugin + Unity package reading `.gss` files directly
- **Community Library** — in-app pattern sharing and downloading
- **Command Palette** (Ctrl+K) — fuzzy-search all actions
