import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Login from './auth/Login';
import RootRedirect from './auth/RootRedirect';
import patientRoutes from './patient/PatientApp';
import doctorRoutes from './doctor/DoctorApp';
import adminRoutes from './admin/AdminApp';
import PrivacyPolicy from './legal/PrivacyPolicy';
import Terms from './legal/Terms';
import DeleteAccount from './legal/DeleteAccount';
import { SessionProvider } from '@shared/session/SessionContext';

/**
 * The one router for the whole website.
 *
 * It follows the mobile app's flow: everyone signs in at /login, lands in
 * User mode (/patient), can register as a doctor from there, and then
 * switches between User and Doctor mode (/doctor) on that same sign-in.
 * Both modes sit under one SessionProvider, so a switch is a route change
 * over data already loaded.
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
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public legal pages: linked from both apps and the Play Store listing. */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route element={<SessionLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        {patientRoutes()}
        {doctorRoutes()}
      </Route>
      {adminRoutes()}
      {/* Anything unrecognised starts again from the top, which sends a
          signed-in person to their home and anyone else to sign in. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
