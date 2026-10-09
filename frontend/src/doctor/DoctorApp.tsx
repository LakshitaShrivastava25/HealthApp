import { Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import SessionStatus from '../auth/SessionStatus';
import Register from './pages/Register';
import PendingVerification from './pages/PendingVerification';
import MyPatients from './pages/MyPatients';
import Profile from './pages/Profile';
import RequestAccess from './pages/RequestAccess';
import PatientRecordView from './pages/PatientRecordView';

/**
 * Doctor mode — the same signed-in account as User mode, switched over.
 *
 * Which doctor screen someone may see follows their registration, exactly
 * as the mobile app's doctor-setup / doctor groups do:
 *   not registered       → /doctor/register (reached from User mode)
 *   pending or rejected  → /doctor/pending, plus their own profile to fix it
 *   verified             → patients, requests, records
 *
 * These gates only decide which screen to show. The backend enforces the
 * same rules on every request (doctors/access.py), so skipping a gate shows
 * an empty page, never a patient's records.
 */
type Need = 'signed-in' | 'registered' | 'verified';

function DoctorGate({ need, children }: { need: Need; children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loadFailed, hasRegistered, doctor } = useAuth();
  const location = useLocation();

  if (isLoading || loadFailed) return <SessionStatus />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (need === 'signed-in') {
    // The registration form is only for accounts that have not registered.
    return hasRegistered ? <Navigate to="/doctor" replace /> : <>{children}</>;
  }
  if (!hasRegistered) return <Navigate to="/doctor/register" replace />;
  const verified = doctor?.verification_status === 'verified';
  if (need === 'verified' && !verified) return <Navigate to="/doctor/pending" replace />;
  return <>{children}</>;
}

export default function doctorRoutes() {
  return (
    <Route path="/doctor">
      {/* The old Doctor Portal sign-in; everyone signs in at /login now. */}
      <Route path="login" element={<Navigate to="/login" replace />} />
      <Route
        path="register"
        element={
          <DoctorGate need="signed-in">
            <Register />
          </DoctorGate>
        }
      />
      <Route
        path="pending"
        element={
          <DoctorGate need="registered">
            <PendingVerification />
          </DoctorGate>
        }
      />
      <Route
        element={
          <DoctorGate need="verified">
            <AppLayout />
          </DoctorGate>
        }
      >
        <Route index element={<MyPatients />} />
        <Route path="request-access" element={<RequestAccess />} />
        <Route path="patients/:profileId" element={<PatientRecordView />} />
      </Route>
      {/* Reachable before verification: editing the registration number
          resets the account to pending, and a rejected doctor needs a way
          to correct the details that got them rejected. */}
      <Route
        element={
          <DoctorGate need="registered">
            <AppLayout />
          </DoctorGate>
        }
      >
        <Route path="profile" element={<Profile />} />
      </Route>
    </Route>
  );
}
