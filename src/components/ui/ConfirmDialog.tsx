// ConfirmDialog.tsx — reusable destructive-action confirmation modal.
//
// Rationale (audit R-17): Toolbar.tsx used the native `window.confirm()`
// for "discard current graph", which renders as an unstyled OS dialog,
// visually inconsistent with the rest of GSS's custom UI, and isn't
// keyboard/focus-managed the way the app's other modals (SettingsModal)
// are. This mirrors SettingsModal's existing overlay pattern instead of
// introducing a new modal framework.

import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-card border border-border rounded-lg p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-white mb-2">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="text-xs text-muted mb-5">
          {message}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs rounded text-white transition-colors ${
              danger ? 'bg-danger hover:bg-danger/80' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
