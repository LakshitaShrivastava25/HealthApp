import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '../context/AuthContext';

/**
 * Sends anyone without a PIN to set one, from wherever they are.
 *
 * The check cannot live in `app/index.tsx` alone. A returning session is
 * restored from the cache and routed to its portal immediately, and the
 * real `has_mpin` only arrives a moment later when /auth/me/ answers — by
 * which point the index route has unmounted and nothing is watching. This
 * sits above the navigator, so it sees that answer whenever it comes.
 *
 * Renders nothing; it only redirects.
 */
export default function RequirePin() {
  const { isAuthenticated, account, portal, profiles } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated || !account) return;
    // Strictly false: `undefined` means a session cached before this field
    // existed, and bouncing someone to setup on a guess would be worse
    // than waiting one request for the truth.
    if (account.has_mpin !== false) return;
    // profile-setup is the registration screen: details + PIN together.
    if (pathname === '/mpin-setup' || pathname === '/profile-setup') return;
    // No profile yet = registration never finished; otherwise just the PIN.
    router.replace(portal === 'patient' && profiles.length === 0 ? '/profile-setup' : '/mpin-setup');
  }, [isAuthenticated, account, portal, profiles.length, pathname]);

  return null;
}
