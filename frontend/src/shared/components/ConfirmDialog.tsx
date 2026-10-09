import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '../hooks/useBackToClose';

/**
 * A small "are you sure?" dialog — used before logging out, so a stray tap
 * on Log out does not end the session. Back, Escape and a tap outside all
 * mean "stay".
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Stay',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useBackToClose(open, onCancel);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-xl2 bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-ink-900">{title}</h2>
        {message && <p className="mt-1.5 text-sm text-ink-500">{message}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
              tone === 'danger' ? 'bg-danger hover:bg-danger/90' : 'bg-accent hover:bg-accent-dark'
            }`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
