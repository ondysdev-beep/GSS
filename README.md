# GSS — Game Systems Simulator

Tauri + React + TypeScript

GSS is a node-based economy designer and simulator for game developers. Build resource flow graphs, run deterministic simulations, detect exploits, and balance your game economy — all in a fast native desktop app.

---

## Download & Install

Grab the latest **FREE** installer for your platform from
[Releases](https://github.com/ondysdev-beep/GSS/releases/latest) (GSS PRO is
available on [itch.io](https://neopryus.itch.io/idle-economy-simulator)) — filenames
include the current version number, which changes with every release, so
it isn't repeated here (see [CHANGELOG.md](./CHANGELOG.md) for what's new).

### Windows (10+)
1. Download the `.msi` (recommended) or `-setup.exe` installer from the latest release
2. Run the installer
3. GSS appears in the Start menu

### macOS (Apple Silicon or Intel)
1. Download the `.dmg` (one universal build for both Apple Silicon and Intel)
2. Drag GSS into Applications

(macOS builds are currently FREE edition only.)

### Linux (any distro)
**AppImage** (recommended — no installation needed):
```bash
chmod +x GSS_*.AppImage
./GSS_*.AppImage
```

**Debian/Ubuntu (.deb)**:
```bash
sudo dpkg -i gss_*_amd64.deb
```

---

## Features

> **Poznámka:** tato tabulka popisuje jen funkce skutečně napojené v UI.
> Zdrojový kód obsahuje i `src/core/_archive/` — porty ze staré Godot verze
> (RPG Analyzer, RNG Psychology, Economy Analyzer a další), které NEJSOU
> aktivní a nejde je v appce nikde použít. Viz `src/core/_archive/README.md`.

| Feature | Free | PRO |
|---|---|---|
| Node-based graph editor (10 node types) | ✅ | ✅ |
| Deterministic simulation | ✅ | ✅ |
| Health score & verdict | ✅ | ✅ |
| Full Intelligence Dashboard (sub-scores, failures, bottlenecks, exploits, RNG) | ❌ | ✅ |
| 12 sample projects + 5 templates + Community Library | ✅ | ✅ |
| AI Economy Generator (BYOK, desktop only) | ✅ | ✅ |
| Economy Diff Viewer + Version History | ✅ | ✅ |
| Save/Load .gss files | ✅ | ✅ |
| CSV + diagnostics export | ✅ | ✅ |
| C# / Unity export | ❌ | ✅ |
| GDScript / Godot 4 export | ❌ | ✅ |
| TypeScript / Web export | ❌ | ✅ |
| AutoTuner (parameter optimizer) | ❌ | ✅ |
| Monte Carlo simulation | ❌ | ✅ |
| Parameter Sweep | ❌ | ✅ |
| A/B Scenario Comparison | ❌ | ✅ |
| PDF Report + Web Share HTML | ❌ | ✅ |
| Multi-Persona Dashboard | ✅ | ✅ |
| Graph size / simulated time per run | 15 nodes / 120 s | unlimited |

**Get PRO:** [neopryus.itch.io/idle-economy-simulator](https://neopryus.itch.io/idle-economy-simulator)

---

## Node Types

| Node | Description |
|---|---|
| **Pool** | Resource storage with capacity |
| **Source** | Generates resources at a set rate |
| **Converter** | Transforms one resource into another |
| **Drain** | Consumes resources at a set rate |
| **Gate** | Passes flow through while a condition on a resource total holds (GT/GTE/LT/LTE/EQ/NEQ); drains can also pull through an open gate |
| **Chance** | Probability branch (0–100%): output 1 on success, output 2 on failure |
| **Splitter** | Splits flow across its outputs equally or by weights |
| **Timer** | Exact pulse every N seconds (e.g. daily reward) |
| **Formula** | Computed output from a safe expression (e.g. `level * 1.2`) |
| **Player Action** | Simulated player-triggered action, stochastic average cadence |

How each node behaves tick by tick, its fields and common patterns:
**[docs/NODE_REFERENCE.md](./docs/NODE_REFERENCE.md)**. The short version
is in the app: select a node and open "How does this node work?".

---

## Build from Source

### Requirements
- [Node.js 20+](https://nodejs.org)
- [Rust stable](https://rustup.rs)
- Windows: Visual Studio C++ Build Tools

```bash
# Clone
git clone https://github.com/ondysdev-beep/GSS.git
cd GSS

# Install dependencies
npm install

# Dev mode
npm run tauri dev

# Production build (icons are committed in src-tauri/icons)
npm run tauri build

# Regenerate all icon sizes after changing app-icon-source.png
npm run icons
```

Output installers are in `src-tauri/target/release/bundle/`.

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Graph editor**: ReactFlow
- **State**: Zustand
- **Desktop shell**: Tauri 2 (Rust)
- **FREE / PRO**: separate builds (Cargo feature `pro` / `VITE_EDITION`), no license keys — see [SECURITY.md](./SECURITY.md)

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for user-facing changes and [DEVLOG.md](./DEVLOG.md) for the detailed developer log.

---

## License

© 2025-2026 neopryus. All rights reserved.  
Free tier available. PRO license via [itch.io](https://neopryus.itch.io/idle-economy-simulator).
