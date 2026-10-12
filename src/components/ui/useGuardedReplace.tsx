// useGuardedReplace.tsx — asks for confirmation before an action replaces a
// graph that has unsaved changes (template, sample, import, restore, New…).
// Dřív tyto akce přepsaly rozpracovaný graf bez jakéhokoli dotazu.

import { useCallback, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { ConfirmDialog } from './ConfirmDialog'

export function useGuardedReplace() {
  const [pending, setPending] = useState<{ action: () => void; title: string } | null>(null)

  /** Runs `action` immediately, or after confirmation when the graph has unsaved changes. */
  const guard = useCallback((action: () => void, title = 'Replace the current graph?') => {
    const { isDirty, graph } = useGraphStore.getState()
    if (isDirty && graph.nodes.length > 0) setPending({ action, title })
    else action()
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      message="The current graph has unsaved changes that will be lost. Save it first if you want to keep it."
      confirmLabel="Discard changes"
      onConfirm={() => { const a = pending?.action; setPending(null); a?.() }}
      onCancel={cancel}
    />
  )

  return { guard, dialog }
}
