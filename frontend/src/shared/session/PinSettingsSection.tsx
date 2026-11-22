import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound, MonitorX } from 'lucide-react';

import ConfirmDialog from '../components/ConfirmDialog';
import { usePin } from './PinContext';

/**
 * "Sign-in PIN" settings, for User and Doctor mode alike — the website's
 * version of the mobile app's pin-settings screen. Rendered inside each
 * mode's own card.
 *
 * "Remove this browser" is the deliberate undo: signing out keeps the
 * browser registered so the PIN still works next time, which is wrong for a
 * shared or public computer.
 */
export default function PinSettingsSection() {
  const pin = usePin();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await pin.removeDevice();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900">
        <KeyRound size={16} className="text-accent-ink" /> Sign-in PIN
      </p>
      <p className="mb-3 text-xs text-ink-500">
        {pin.isRegistered
          ? 'You sign in with your 4-digit PIN on this browser.'
          : 'Set a PIN to sign in on this browser without waiting for a code.'}
      </p>

      {pin.isRegistered ? (
        <div className="space-y-0.5">
          <Link
            to="/pin/setup?mode=change"
            className="flex w-full items-center justify-between rounded-lg px-2 py-3 text-sm font-medium text-ink-700 hover:bg-surface"
          >
            Change PIN
            <ChevronRight size={15} className="text-ink-500" />
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            <MonitorX size={15} /> Remove this browser
          </button>
        </div>
      ) : (
        <Link
          to="/pin/setup"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <KeyRound size={14} /> Set up a PIN
        </Link>
      )}

      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[11.5px] leading-relaxed text-ink-500">
        <p>
          Your PIN signs you in. A one-time code is only used to set up a new browser or phone, or to reset a PIN
          you have forgotten.
        </p>
        <p>
          After three wrong tries you will be asked to wait. If you forget it, choose Forgot PIN on the sign-in page.
        </p>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Remove this browser?"
        message="Your PIN stays on your account and keeps working on your other devices. On this browser you will need a code to sign in again."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
