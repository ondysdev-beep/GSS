# Missing Features & Future Roadmap (v3.3.0+)

> **Poznámka (aktualizace v3.3.0):** tento dokument byl v mnoha bodech
> zastaralý — všechny položky označené ✅ HOTOVO jsou reálně implementované
> a napojené v appce (ověřeno importy/testy, ne jen přítomností souboru).
> Pozor: soubory v `src/core/_archive/` (RPG Analyzer, RNG Psychology,
> Economy Analyzer a další) NEJSOU aktivní funkce — jsou to porty ze staré
> Godot verze, nikde nenapojené, viz `src/core/_archive/README.md`. Pokud
> se řeší marketing/dokumentace, čerpej stav z tohoto souboru nebo přímo
> z `App.tsx`, ne z názvů souborů v `src/core/`.

## High Impact Features Missing from GSS 3.1.0

### 1. Live Flow Visualization — ✅ HOTOVO (v3.2.0)

### 2. AI Economy Generator — ✅ HOTOVO (`EconomyGenerator.ts` + `AIGeneratorModal.tsx`, Settings → AI Generator). BYOK model (vlastní Anthropic klíč, GSS žádný AI backend nemá). Web verze zatím bez podpory — chybí CORS proxy, viz `src/platform/web.ts`.

### 3. Web Share Export — ✅ HOTOVO (`ExportPanel.tsx` → `buildWebShareHtml`, PRO)

### 4. Advanced Node Types (Priority: Medium) — ČÁSTEČNĚ HOTOVO
- **Timer**: ✅ HOTOVO — periodický pulz (`NodeType.TIMER`)
- **Formula**: ✅ HOTOVO — vlastní výraz (`NodeType.FORMULA`, bezpečný parser bez eval)
- **Player Action**: ✅ HOTOVO — stochasticky spouštěná akce (`NodeType.PLAYER_ACTION`); jde o dávkovou/deterministickou simulaci s náhodným RNG-driven triggerem, NE o živě klikací UI tlačítko za běhu editoru — to zůstává budoucí, výrazně větší funkce
- **Seasonal Event**: stále chybí — časově omezený boost zdrojů (např. Vánoční event 2× produkce po dobu X dní)
- **Why**: More expressive economy modeling

### 5. Multi-Persona Dashboard — ✅ HOTOVO (`MultiPersonaChart.tsx`, Analysis tab)

### 6. Economy Diff Viewer — ✅ HOTOVO (`DiffViewerPanel.tsx`, Library → Diff)

### 7. GSS SDK — ✅ HOTOVO, ČÁSTEČNĚ (`src/core/sdk.ts` + `sdk/example.ts` CLI). Godot/Unity živé pluginy NEjsou hotové — vyžadují editor toolchain, který nebylo možné otestovat; dnešní praktický most jsou existující C#/GDScript exportéry (`src/core/exporters/`). Viz `sdk/README.md`.

### 8. Community Library — ✅ HOTOVO, ČÁSTEČNĚ (`CommunityLibraryPanel.tsx`, Library → Community). "Browse" čte statický `community-index.json` z GitHubu (žádný vlastní backend), "Import z URL" funguje s libovolným zdrojem. "Share" = kopírování JSON do schránky, ne GitHub OAuth flow.

### 9. Command Palette — ✅ HOTOVO (v3.2.0, `CommandPalette.tsx`, Ctrl+K)

## Quality of Life Improvements

### 10. Undo/Redo UI Indicators
- Show current position in history stack
- Keyboard shortcuts (Ctrl+Z/Ctrl+Y)

### 11. Graph Search & Filtering
- Find nodes by name/type
- Highlight paths between nodes

### 12. Performance Mode
- Disable heavy visualizations during long simulations
- Background simulation with progress notification

### 13. Template Wizard — ✅ HOTOVO (`TemplateWizardModal.tsx`, Toolbar → "+Template" → "🪄 Otevřít průvodce"). 2-krokový: výběr žánru/šablony + přejmenování hlavního resource + škálování ekonomiky.

### 14. Export Improvements
- PDF report generation — ✅ HOTOVO (`ExportPanel.tsx` → `buildPDFHtml`, print-to-PDF, PRO)
- Excel dashboard export
- Animated GIF of simulation

### 15. Localization
- Multi-language UI support
- Currency/number formatting by region

## Technical Debt & Infrastructure

### 16. Code Splitting — ✅ HOTOVO (`App.tsx`, `React.lazy` pro AutoTuner/Intelligence/Charts/Library panely). Naměřeno: hlavní bundle 883 KB → 398 KB.

### 17. Test Coverage
- Unit tests for core simulation logic
- E2E tests for critical workflows

### 18. Error Reporting
- Automatic crash reports
- User feedback integration

### 19. Plugin System
- Custom node type API
- Community extensions

### 20. Cloud Sync
- Save/load graphs from cloud storage
- Collaboration features

---

## Prioritization Framework

### Immediate (v3.1.1)
- Live Flow Visualization
- Undo/Redo UI
- Command Palette

### Short Term (v3.2.0)
- AI Economy Generator
- Web Share Export
- Advanced Node Types

### Medium Term (v3.3.0)
- Multi-Persona Dashboard
- Economy Diff Viewer
- Community Library

### Long Term (v4.0.0)
- GSS SDK
- Cloud Sync
- Plugin System

---

## Implementation Notes

- **Live Flow**: Leverage existing `simulationStore` tick traces; minimal backend changes
- **AI Generator**: Requires API key management; start with local templates first
- **Web Export**: Use existing Vite build; embed sample data in HTML
- **SDK**: Extract `src/core` into separate package; maintain API compatibility

---

## Conclusion

GSS 3.1.0 is a solid foundation with a complete analysis pipeline. The highest-impact missing features are **Live Flow Visualization** and **AI Economy Generator**, as they directly address user onboarding and debugging efficiency. The platform is ready for these enhancements with minimal architectural changes.
