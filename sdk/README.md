# GSS SDK

Veřejné, framework-nezávislé API simulačního jádra GSS — použitelné mimo
desktopovou aplikaci (Node.js skripty, CI pipeline, build kroky jiných
nástrojů). Vstupní bod: [`src/core/sdk.ts`](../src/core/sdk.ts).

## Co je skutečně hotové

- **`src/core/sdk.ts`** — barrel export veřejného API (simulace, validace,
  scénáře, health score, šablony, diff, formula evaluator). Ověřeno testem
  [`src/core/__tests__/sdk.test.ts`](../src/core/__tests__/sdk.test.ts),
  který spouští kompletní simulaci pouze z tohoto souboru, bez importu
  čehokoli jiného z projektu.
- **`sdk/example.ts`** — funkční CLI příklad. Spustitelné hned:
  ```bash
  npm run sdk:example -- public/samples/idle_tycoon.json 60 1 42
  # cesta_ke_grafu  ticks  dt  seed
  ```
  Validuje graf, spustí simulaci, vypíše finální stav poolů jako JSON.
  Vrací exit code 1 a seznam chyb, pokud graf neprojde validací.
- **Ověřená portabilita**: žádný z modulů re-exportovaných ze `sdk.ts`
  (`TickEngine.ts`, `SimRNG.ts`, `GraphValidator.ts`, `FormulaEvaluator.ts`,
  `ScenarioRunner.ts`, `HealthScoreCalculator.ts`, `GraphDiffer.ts`,
  `PlayerPersona.ts`, `GraphTemplates.ts`, `TemplateCustomizer.ts` a typy
  v `src/types/`) neobsahuje import Reactu, Tauri ani Zustand — ověřeno
  greppem přes všechny importy před vytvořením tohoto SDK, ne jen tvrzením.

## Co NENÍ hotové (a proč)

- **Publikace na npm.** `sdk.ts` je připravené k extrakci do samostatného
  balíčku (např. `@gss/core`), ale skutečná publikace (`npm publish`,
  vyhrazení jména balíčku, sémantické verzování nezávislé na desktop app)
  je manuální krok vyžadující npm účet vlastníka projektu — nebylo to
  možné (ani smysluplné) provést automaticky v rámci této session.
- **Unity plugin.** Nebyl vytvořen — vyžaduje Unity Editor a C# toolchain,
  které v tomto prostředí nejsou dostupné a nešlo by je otestovat. GSS už
  ale dnes MÁ praktický most k Unity: **`ExportPanel` → C# export**
  (`src/core/exporters/csharp.ts`) generuje statický C# kód z grafu. Živý
  plugin (import `.gss` přímo v Unity Editoru, ne přes vygenerovaný kód)
  zůstává budoucí, výrazně větší práce.
- **Godot plugin.** Totéž — GSS už má **GDScript export**
  (`src/core/exporters/gdscript.ts`) jako dnešní praktické řešení. Živý
  Godot plugin by vyžadoval Godot editor a GDScript runtime k otestování,
  což zde nebylo možné.
- **TypeScript export/CLI pro externí TS projekty** — `exporters/typescript.ts`
  už existuje (generuje TS kód z grafu); `sdk.ts` je jiný, doplňkový případ
  užití: ne export dat, ale přímé spuštění simulace v cizím TS/JS projektu.

Pokud v budoucnu budeš chtít Unity/Godot plugin dotáhnout, `sdk.ts` je
přesně to místo, odkud by taková integrace typovala svá data — grafový
formát a simulační engine jsou už oddělené od UI a připravené.
