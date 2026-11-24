import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound } from 'lucide-react';

import { usePin } from './PinContext';

/**
 * "Sign-in PIN" settings, for User and Doctor mode alike — the website's
 * version of the mobile app's pin-settings screen. Rendered inside each
 * mode's own card.
 *
 * Change PIN only. "Remove this browser" was taken out: the PIN now signs in
 * by number on any device, so un-registering one browser no longer protects
 * anything, and it only sent people back to waiting for an SMS code.
 */
export default function PinSettingsSection() {
  const pin = usePin();

  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900">
        <KeyRound size={16} className="text-accent-ink" /> Sign-in PIN
      </p>
      <p className="mb-3 text-xs text-ink-500">
        {pin.isRegistered
          ? 'You sign in with your number and 4-digit PIN.'
          : 'Set a PIN to sign in without waiting for a code.'}
      </p>

      {pin.isRegistered ? (
        <Link
          to="/pin/setup?mode=change"
          className="flex w-full items-center justify-between rounded-lg px-2 py-3 text-sm font-medium text-ink-700 hover:bg-surface"
        >
          Change PIN
          <ChevronRight size={15} className="text-ink-500" />
        </Link>
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
          Your PIN signs you in with your number on any device. A one-time code is only used when you register,
          or to reset a PIN you have forgotten.
        </p>
        <p>
          After three wrong tries you will be asked to wait. If you forget it, choose Forgot PIN on the sign-in page.
        </p>
      </div>
    </div>
  );
}
