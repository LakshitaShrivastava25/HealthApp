import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useSession } from '@shared/session/SessionContext';

/** Pages a signed-in account without a PIN may still open. */
const EXEMPT = ['/pin/setup', '/login', '/privacy', '/terms', '/delete-account'];

/**
 * Sends anyone without a PIN to set one, from wherever they are — the
 * website's version of the mobile app's RequirePin.
 *
 * Sits above every User/Doctor mode route (App.tsx), so it also catches an
 * account that left /login before finishing the PIN step, or a session that
 * was signed in before PINs existed. Renders nothing; it only redirects.
 */
export default function RequirePin() {
  const { isAuthenticated, account } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !account) return;
    // Strictly false: `undefined` means the field never arrived, and sending
    // someone to set a PIN on a guess would be worse than waiting.
    if (account.has_mpin !== false) return;
    if (EXEMPT.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return;
    navigate('/pin/setup', { replace: true });
  }, [isAuthenticated, account, pathname, navigate]);

  return null;
}
