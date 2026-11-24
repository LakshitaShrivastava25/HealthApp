import { Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Login from './auth/Login';
import RootRedirect from './auth/RootRedirect';
import RequirePin from './auth/RequirePin';
import patientRoutes from './patient/PatientApp';
import doctorRoutes from './doctor/DoctorApp';
import adminRoutes from './admin/AdminApp';
import { SessionProvider } from '@shared/session/SessionContext';
import { PinProvider } from '@shared/session/PinContext';
import { PUBLIC_PATHS, signedInPortal } from '@shared/session/portalLock';
import { lazyPage } from '@shared/lazyPage';
import PageFallback from '@shared/components/PageFallback';

const PrivacyPolicy = lazyPage('public', () => import('./legal/PrivacyPolicy'));
const Terms = lazyPage('public', () => import('./legal/Terms'));
const DeleteAccount = lazyPage('public', () => import('./legal/DeleteAccount'));
const PinSetup = lazyPage('public', () => import('./auth/PinSetup'));

/**
 * The one router for the whole website.
 *
 * It follows the mobile app's flow: everyone signs in at /login, lands in
 * User mode (/patient), can register as a doctor from there, and then
 * switches between User and Doctor mode (/doctor) on that same sign-in.
 * Both modes sit under one SessionProvider, so a switch is a route change
 * over data already loaded.
 *
 * The legal pages and the catch-all sit under the same provider: opening the
 * Privacy Policy from Settings and pressing Back used to unmount the whole
 * session and load it again from scratch (and reset the chosen family member).
 *
 * The staff Admin Portal keeps its own provider and token store: staff
 * accounts are handed to it from /login rather than mixed into a patient's
 * session.
 *
 * Each area contributes its <Route> subtree from its own file. They are
 * called as functions rather than rendered as <PatientRoutes /> because
 * <Routes> only accepts <Route> elements as children.
 */
function SessionLayout() {
  const { pathname } = useLocation();
  // Signed in to the Admin Portal: the User Portal stays closed until that
  // session ends (shared/session/portalLock). Legal pages stay open.
  if (signedInPortal() === 'admin' && !PUBLIC_PATHS.includes(pathname)) {
    return <Navigate to="/admin" replace />;
  }
  return (
    <SessionProvider>
      {/* PIN sign-in, as in the mobile app: PinProvider holds this browser's
          registration; RequirePin sends an account without a PIN to set one. */}
      <PinProvider>
        <RequirePin />
        <Outlet />
      </PinProvider>
    </SessionProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback fullScreen />}>
      <Routes>
        <Route element={<SessionLayout />}>
          {/* Public legal pages: linked from both apps and the Play Store listing. */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/pin/setup" element={<PinSetup />} />
          {patientRoutes()}
          {doctorRoutes()}
          {/* Anything unrecognised starts again from the top, which sends a
              signed-in person to their home and anyone else to sign in. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {adminRoutes()}
      </Routes>
    </Suspense>
  );
}
