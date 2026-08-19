# Changelog

User-facing summary of changes. For a detailed, file-level developer log,
see [DEVLOG.md](./DEVLOG.md).

## 3.3.0 — New features, bug fixes, web version

**New features**
- Economy Diff Viewer — compare current graph against version history or an uploaded file
- Multi-Persona Dashboard — see Casual/Grinder/Min-Maxer wealth over time side by side
- 3 new node types: Timer (exact pulse), Formula (custom expression), Player Action (stochastic trigger)
- Template Wizard — pick a template, rename the currency, scale the economy
- AI Economy Generator — describe an economy in text, GSS builds the graph (bring your own Anthropic API key)
- Community Library — browse and import shared graphs, or import from any URL
- GSS SDK — simulation core now usable outside the desktop app (Node.js/CI), see `sdk/README.md`
- Onboarding welcome screen on first launch (shows once, not on every startup)
- **Automatic updates** — GSS now checks for, downloads, and installs updates
  itself (desktop only), then restarts. No more manually checking itch.io
  and re-downloading the installer.

**Changed**
- **PRO is now a separate download, not a license key.** GSS used to have a
  single build where you'd paste an itch.io download key to unlock PRO
  features. That's gone — FREE and PRO are now simply two different
  installers/web builds, same as most desktop software without an online
  activation server. If you previously activated a key, there's nothing to
  do; the FREE/PRO build you download now determines your edition.

**Bug fixes**
- Fixed a crash when loading a graph with a malformed node (relevant now that graphs can come from AI generation or the community library)
- Fixed a possible multi-second UI freeze with an extreme Timer node configuration
- Fixed a race condition where closing the AI generator or community import mid-request could silently overwrite your graph later
- Several smaller fixes — see DEVLOG.md for the full list

**Documentation**
- Corrected feature list — some previously-listed features (e.g. "RNG Psychology analysis") were never actually wired into the app; the README now accurately reflects what's live

## 3.2.1 — Stability & security update

**Security**
- Removed a hardcoded API credential from the app and tightened how license
  validation handles it (see `SECURITY.md` for details — some follow-up
  action was required outside the app itself, e.g. rotating the key).
- Removed accidentally-included internal files from the project that had
  no business being distributed with the app.
- Locked down what the app's internal browser view is allowed to load and
  connect to (Content Security Policy), reducing the impact of any future
  bug that might otherwise let untrusted content run.
- Reduced the app's requested filesystem/storage permissions to only what
  it actually uses.

**Stability**
- GSS no longer shows a blank white screen if it hits an unexpected error.
  You'll now see a recovery screen with the option to continue or restart,
  and your last auto-saved graph (from within the last 30 seconds) is
  recovered automatically on restart.
- Fixed an inconsistency in how simulations handled randomness internally
  that could, in specific edge cases, allow two independent simulation runs
  to influence each other's results.

**Performance & footprint**
- Fonts are now bundled with the app instead of being downloaded from
  Google Fonts on every launch — GSS now starts without needing a network
  connection for its own interface.

**Under the hood**
- Consolidated four overlapping release pipelines into one, so every
  release build is tested before it's published (previously most were not).
- Restored working code linting, which had silently stopped functioning.
- Cleaned up a substantial amount of unused legacy code left over from the
  original Godot version of GSS, without touching any active feature.

No user-facing feature changes in this update — it focuses entirely on
hardening the app ahead of the next feature release. See DEVLOG.md for the
3.2.0 feature/bugfix history (Health Score fixes, AutoTuner cancellation,
live flow visualization, Performance Mode, graph search, and more).
