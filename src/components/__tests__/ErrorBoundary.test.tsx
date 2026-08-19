// ErrorBoundary.test.tsx — covers the new R-03 fallback UI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error to the console by default; keep test
    // output clean without hiding real assertion failures.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders the fallback UI instead of crashing when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart gss/i })).toBeInTheDocument()
  })

  it('"Try to continue" resets the boundary and re-renders children', () => {
    let shouldThrow = true
    function MaybeBomb() {
      if (shouldThrow) throw new Error('boom')
      return <div>Recovered</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <MaybeBomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()

    // Fix the underlying condition, then click "continue" to reset state.
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try to continue/i }))
    rerender(
      <ErrorBoundary>
        <MaybeBomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Recovered')).toBeInTheDocument()
  })
})
