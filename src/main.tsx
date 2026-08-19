import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Self-hosted fonts (audit R-15): previously loaded at runtime from
// fonts.googleapis.com/fonts.gstatic.com, which made a native desktop app's
// startup depend on an external network request and sent a request to
// Google on every launch. @fontsource bundles the same font files locally,
// served from the app's own bundle — this also lets the Tauri CSP (R-04)
// avoid allowing any external font/style origins.
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
