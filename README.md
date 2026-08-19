# GSS — Game Systems Simulator

Tauri + React + TypeScript

GSS is a node-based economy designer and simulator for game developers. Build resource flow graphs, run deterministic simulations, detect exploits, and balance your game economy — all in a fast native desktop app.

---

## Download & Install

Grab the latest installer for your platform from
[Releases](https://github.com/ondysdev-beep/GSS/releases/latest) — filenames
include the current version number, which changes with every release, so
it isn't repeated here (see [CHANGELOG.md](./CHANGELOG.md) for what's new).

### Windows (10+)
1. Download the `.msi` (recommended) or `-setup.exe` installer from the latest release
2. Run the installer
3. GSS appears in the Start menu

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
| Intelligence Dashboard (health, verdict, bottlenecks) | ✅ | ✅ |
| 12 sample projects + Community Library | ✅ | ✅ |
| Exploit Discovery | ✅ | ✅ |
| AI Economy Generator (BYOK) | ✅ | ✅ |
| Economy Diff Viewer | ✅ | ✅ |
| Save/Load .gss files | ✅ | ✅ |
| CSV export | ❌ | ✅ |
| C# / Unity export | ❌ | ✅ |
| GDScript / Godot 4 export | ❌ | ✅ |
| TypeScript / Web export | ❌ | ✅ |
| AutoTuner (parameter optimizer) | ❌ | ✅ |
| Monte Carlo simulation | ❌ | ✅ |
| Parameter Sweep | ❌ | ✅ |
| Multi-Persona Dashboard | ✅ | ✅ |

**Get PRO:** [neopryus.itch.io/idle-economy-simulator](https://neopryus.itch.io/idle-economy-simulator)

---

## Node Types

| Node | Description |
|---|---|
| **Pool** | Resource storage with capacity |
| **Source** | Generates resources at a set rate |
| **Converter** | Transforms one resource into another |
| **Drain** | Consumes resources at a set rate |
| **Gate** | Conditional flow control (GT/LT/EQ/NEQ) |
| **Chance** | Probability branch (0–100%) |
| **Splitter** | Splits flow to multiple outputs by ratio |
| **Timer** | Exact pulse every N seconds (e.g. daily reward) |
| **Formula** | Computed output from a safe expression (e.g. `level * 1.2`) |
| **Player Action** | Simulated player-triggered action, stochastic average cadence |

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

# Production build
node generate-icons.cjs   # generate icons first
npm run tauri build
```

Output installers are in `src-tauri/target/release/bundle/`.

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Graph editor**: ReactFlow
- **State**: Zustand
- **Desktop shell**: Tauri 2 (Rust)
- **License validation**: Gumroad API via Tauri backend

---

## Changelog

See [DEVLOG.md](./DEVLOG.md) for full history of changes from the Godot version.

---

## License

© 2024 neopryus. All rights reserved.  
Free tier available. PRO license via [itch.io](https://neopryus.itch.io/idle-economy-simulator).
