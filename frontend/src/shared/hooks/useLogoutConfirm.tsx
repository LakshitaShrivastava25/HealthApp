import { useCallback, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * Log out — after asking. Every logout button (sidebars, Settings, the
 * pending-verification and connection-problem screens) goes through this,
 * so a stray tap never ends the session.
 *
 * On "Log out" it ends the session and then does a hard navigation to
 * /login: a full document load discards all in-memory auth state, any
 * request still in flight and the refresh state, so nothing can survive into
 * the next person's session on a shared machine. replace() rather than
 * assign(), so Back does not walk into pages of the session just ended.
 */
export function useLogoutConfirm(
  logout: () => void | Promise<void>,
  /** Where to sign in again: /login for everyone, /admin for the Admin Portal. */
  signInPath = '/login'
) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestLogout = useCallback(() => setOpen(true), []);
  const cancel = useCallback(() => setOpen(false), []);
  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      window.location.replace(signInPath);
    }
  }, [logout, signInPath]);

  const dialog = (
    <ConfirmDialog
      open={open}
      title="Log out?"
      message="You will need to sign in again to continue."
      confirmLabel="Log out"
      cancelLabel="Stay"
      busy={busy}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );

  return { requestLogout, dialog };
}
