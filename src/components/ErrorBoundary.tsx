// ErrorBoundary.tsx — top-level React error boundary.
//
// Rationale (audit R-03): GSS previously had no error boundary anywhere,
// so any uncaught rendering error produced a blank white screen with no
// way to recover, and no path back to the user's work.
//
// Design is intentionally minimal:
// - Class component (the only way to implement getDerivedStateFromError).
// - No new global state, no new persistence layer: recovery reuses the
//   autosave that already exists (App.tsx restores it via loadAutoSave()
//   on mount), so a full reload is enough to get the user's graph back.
// - "Try to continue" resets the boundary without a full reload, for
//   transient errors that a re-render can clear.
// - Technical details (message + stack) are only shown when running in
//   dev mode (import.meta.env.DEV); production users see a plain message.

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
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
    // A full reload re-runs App.tsx's startup effect, which calls
    // loadAutoSave() and restores the graph — this IS the recovery path,
    // reusing existing infrastructure instead of duplicating it here.
    window.location.reload()
  }

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-white font-sans px-6">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 text-center">
          <div className="text-3xl mb-3" aria-hidden="true">⚠</div>
          <h1 className="text-sm font-semibold mb-2">GSS ran into an unexpected error</h1>
          <p className="text-xs text-muted mb-5">
            The application is in an inconsistent state. Your graph was
            auto-saved within the last 30 seconds and will be restored on reload.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.handleContinue}
              className="px-3 py-1.5 text-xs rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
            >
              Try to continue
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
