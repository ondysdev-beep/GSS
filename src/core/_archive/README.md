# _archive — nepoužívané moduly (R-05)

Tento adresář je **vyloučen z buildu i typekontroly** (`tsconfig.json` →
`exclude`) a nic z aktivního kódu na něj neodkazuje. Nejde o funkční část
aplikace — je to prostor pro kód, který nebyl smazán, protože může být
znovu využitelný, ale který zásadně matl analýzu projektu tím, že ležel
v `src/core` vedle aktivně používaných modulů.

## Proč tu tyto soubory jsou

Všech 12 souborů má v hlavičce komentář `// port GDScript X.gd` — jde o
1:1 přepisy modulů z **předchozí Godot verze GSS** (viz `README.md` — GSS
byl přepsán z Godotu do Tauri/React). Během migrace zůstaly beze změny
zkopírované, ale nikdy nebyly napojeny na nový, uzlově-grafový
(`GSSGraph`/`TickEngine`) simulační model, který nová verze GSS používá.

## Klasifikace (audit R-05)

| Soubor | Klasifikace | Zdůvodnění |
|---|---|---|
| `EconomyModule.ts` | **ARCHIVE** | Vlastní paralelní simulační smyčka (`EconomyState`, ne `GSSGraph`) se stejnojmennou funkcí `simulateTick()` jako kanonický `TickEngine.ts` — reálné riziko záměny. Nejvyšší priorita k odsunutí z aktivního `src/core`. |
| `GraphModule.ts` | ARCHIVE | Subgraph moduly pro starý grafový model, nekompatibilní s aktuálním `GSSGraph`. |
| `StrategyModule.ts` | ARCHIVE | Výrobní řetězce/bottlenecky mimo aktuální node-graph paradigma. |
| `RPGModule.ts` + `RPGAnalyzer.ts` | ARCHIVE (dvojice) | RPG progresní systém (XP křivky) nezávislý na `GSSGraph`; `RPGAnalyzer` na `RPGModule` přímo závisí. |
| `EconomyAnalyzer.ts` | ARCHIVE | Analýza starého `EconomyModule` modelu. |
| `CausalRecommendation.ts` | ARCHIVE | Nenapojeno na aktuální `RecommendationEngine`/`Verdict` pipeline. |
| `RNGPsychology.ts` | ARCHIVE | Samostatný, nenapojen na `HealthScoreCalculator`/`AutoTuner`. |
| `AccuracyFeedback.ts` | ARCHIVE | Rekalibrace prahů verdiktů — nenapojeno na aktuální `VerdictSystem`. |
| `FolderExporter.ts` | ARCHIVE | Alternativní multi-souborový export, duplicitní k `exporters/json.ts`. |
| `OutputFormatter.ts` | ARCHIVE | Formátování verdiktů — nenapojeno, formátování dnes řeší přímo komponenty. |
| `CompiledGraph.ts` | ARCHIVE | Pre-indexovaná grafová struktura pro výkon — validní nápad, ale nikde nevolaná; pokud v budoucnu vznikne výkonnostní problém v AutoToneru/Monte Carlu při velkých grafech, je tohle první místo, kam se podívat. |

## Moduly, které audit označil za zvláštní pozornost, ale ZDE NEJSOU

Tyto zůstaly na svém původním místě v `src/core` (aktivně typekontrolované),
protože pracují s aktuálním `GSSGraph` typem a nejsou v konfliktu s ničím
existujícím:

- **`PlayerPersona.ts`** — kompatibilní s `GSSGraph`. `ScenarioRunner.ts`
  aktuálně řeší persony vlastní zjednodušenou logikou (`_adjustDrainRates`)
  místo použití tohoto propracovanějšího modulu — jde o duplicitu, ne o
  mrtvý kód. Skutečné napojení do `ScenarioRunner` je věcný zásah do
  simulační pipeline nad rámec tohoto vydání → **FUTURE IMPROVEMENT**.
  RNG v tomto souboru byl v rámci R-06 opraven (už nepoužívá globální
  `SimRNG` singleton).
- **`GraphDiffer.ts`** — čistá, bezstavová diff funkce nad `GSSGraph`, bez
  RNG, bez side-effectů. `MissingFeatures.md` ji už zmiňuje jako základ
  pro budoucí "Economy Diff Viewer". Neškodí v `src/core`, žádná akce.
- **`Logger.ts`** — centralizovaný log modul; v rámci tohoto update byl
  **INTEGROVÁN** (3 přímá volání `console.*` mimo tento modul byla
  nahrazena voláním `Logger`, viz DEVLOG).

## Co dělat, pokud budete chtít některý modul znovu použít

1. Přesunout soubor zpět do `src/core/`.
2. Opravit relativní importy (byly odsud posunuté o jednu úroveň, např.
   `../types/graph` → zpět `../types/graph` funguje po přesunutí zpět beze
   změny, protože jde jen o dočasný přesun).
3. Odstranit `src/core/_archive` z `exclude` v `tsconfig.json`, pokud v
   adresáři nic nezůstane.
4. Napsat/aktualizovat testy — žádný z archivovaných modulů dnes testy nemá.
