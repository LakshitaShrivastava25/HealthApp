import { RefreshCw, WifiOff } from 'lucide-react';

import { useSession } from '@shared/session/SessionContext';
import { useLogoutConfirm } from '@shared/hooks/useLogoutConfirm';

/**
 * What a route gate shows while the signed-in account loads — or, when the
 * server could not be reached, a way to try again. Without the retry a
 * sleeping backend left people on an endless "Loading…" or, worse, bounced
 * a doctor to the registration form because their record had not arrived.
 */
export default function SessionStatus() {
  const { loadFailed, retryLoad, logout } = useSession();
  const { requestLogout, dialog: logoutDialog } = useLogoutConfirm(logout);

  if (!loadFailed) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-warning-bg text-warning">
          <WifiOff size={20} />
        </div>
        <p className="text-[15px] font-semibold text-ink-900">Couldn&apos;t reach CuraPath</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
          Check your connection. The server can take up to a minute to wake up the first time.
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <button
            type="button"
            onClick={() => void retryLoad()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-purpleDark"
          >
            <RefreshCw size={14} /> Try again
          </button>
          <button
            type="button"
            onClick={requestLogout}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface"
          >
            Sign out
          </button>
          {logoutDialog}
        </div>
      </div>
    </div>
  );
}
