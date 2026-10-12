// ErrorBoundary.tsx — React error boundary (app-level and per panel).
//
// Rationale (audit R-03): GSS previously had no error boundary anywhere,
// so any uncaught rendering error produced a blank white screen with no
// way to recover, and no path back to the user's work.
//
// - Class component (the only way to implement getDerivedStateFromError).
// - App level (default): full-screen recovery screen. "Restart GSS" reloads
//   and App.tsx restores the last autosave. If the autosaved graph itself is
//   what crashes the app, "Start with an empty graph" clears the autosave so
//   the user is not stuck in a crash loop on every restart.
// - `compact`: inline fallback for a single panel/tab, so one broken panel
//   does not take down the whole application.
// - Technical details (message + stack) are only shown in dev mode.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearAutoSave } from '../hooks/useAutoSave'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Inline fallback for a panel instead of the full-screen recovery screen. */
  compact?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Preserve diagnostics for development; avoid noisy console output in
    // production builds where the user can't do anything with a stack trace.
    if (import.meta.env.DEV) {
      console.error('GSS crashed:', error, errorInfo)
    }
    this.setState({ errorInfo })
  }

  private handleContinue = () => {
    this.setState({ error: null, errorInfo: null })
  }

  private handleReload = () => {
    // A full reload re-runs App.tsx's startup effect, which restores the
    // last autosaved graph.
    window.location.reload()
  }

  private handleStartEmpty = () => {
    clearAutoSave()
    window.location.reload()
  }

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    if (this.props.compact) {
      return (
        <div className="m-4 p-4 rounded-lg border border-danger/40 bg-danger/10 text-xs text-white/80">
          <div className="font-semibold mb-1">This panel ran into an unexpected error.</div>
          <div className="text-muted mb-3">The rest of GSS still works — your graph is not affected.</div>
          <button
            onClick={this.handleContinue}
            className="px-3 py-1.5 rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
          >
            Try again
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-3 text-[10px] text-danger whitespace-pre-wrap break-words max-h-40 overflow-auto">
              {error.message}
              {errorInfo?.componentStack}
            </pre>
          )}
        </div>
      )
    }

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-white font-sans px-6">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 text-center">
          <div className="text-3xl mb-3" aria-hidden="true">⚠</div>
          <h1 className="text-sm font-semibold mb-2">GSS ran into an unexpected error</h1>
          <p className="text-xs text-muted mb-5">
            The application is in an inconsistent state. Restarting restores your
            most recent auto-save (unsaved changes made after it may be lost).
            If GSS keeps crashing right after a restart, start with an empty graph.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={this.handleContinue}
              className="px-3 py-1.5 text-xs rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
            >
              Try to continue
            </button>
            <button
              onClick={this.handleStartEmpty}
              className="px-3 py-1.5 text-xs rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
            >
              Start with an empty graph
            </button>
            <button
              onClick={this.handleReload}
              autoFocus
              className="px-3 py-1.5 text-xs rounded bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Restart GSS
            </button>
          </div>

          {import.meta.env.DEV && (
            <details className="mt-5 text-left">
              <summary className="text-[10px] text-muted cursor-pointer select-none">
                Technical details (dev build only)
              </summary>
              <pre className="mt-2 text-[10px] text-danger whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {error.message}
                {errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
