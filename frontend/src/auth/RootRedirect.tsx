import { lazy, Suspense } from 'react';
import { Navigate, useLocation, useNavigationType } from 'react-router-dom';

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
  const navigationType = useNavigationType();
  const location = useLocation();

  // Pressing Back from the app lands on "/" (the entry before /login was
  // replaced). Redirecting a signed-in person straight back into the app
  // made Back look broken — they could never leave. Show the landing page
  // instead; its "Visit Web App" button returns to the app. A fresh visit
  // (typed address, bookmark) still goes straight in.
  const cameBack = navigationType === 'POP' && location.key !== 'default';

  if (isLoading || loadFailed) return <SessionStatus />;
  if (!isAuthenticated || !account || cameBack) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <Landing />
      </Suspense>
    );
  }
  return <Navigate to={landingPath(account.id, !!doctor, profiles.length)} replace />;
}
