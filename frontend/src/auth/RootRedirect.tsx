import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { useSession } from '@shared/session/SessionContext';
import { landingPath } from '@shared/session/mode';
import SessionStatus from './SessionStatus';

// Loaded only when shown: a signed-in person never downloads the landing page.
const Landing = lazy(() => import('../landing/Landing'));

/**
 * "/" — where the website is entered. The whole journey is one line, on one
 * address:
 *
 *   curapath.in (landing page) → curapath.in/login → sign in → the app
 *
 * Signed out → the landing page. Signed in → the mode used last time (User
 * mode by default), or profile setup for an account with no profile yet.
 * Decided here once, not by each screen.
 */
export default function RootRedirect() {
  const { isLoading, isAuthenticated, loadFailed, account, profiles, doctor } = useSession();

  if (isLoading || loadFailed) return <SessionStatus />;
  if (!isAuthenticated || !account) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <Landing />
      </Suspense>
    );
  }
  return <Navigate to={landingPath(account.id, !!doctor, profiles.length)} replace />;
}
