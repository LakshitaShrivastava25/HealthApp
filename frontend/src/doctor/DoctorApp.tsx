import { Outlet, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import PendingVerification from './pages/PendingVerification';
import MyPatients from './pages/MyPatients';
import Profile from './pages/Profile';
import RequestAccess from './pages/RequestAccess';
import PatientRecordView from './pages/PatientRecordView';

function Gate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasRegistered, doctor } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/doctor/login" replace />;
  }
  if (!hasRegistered) {
    return <Navigate to="/doctor/register" replace />;
  }
  if (doctor && doctor.verification_status !== 'verified') {
    return <Navigate to="/doctor/pending" replace />;
  }
  return <>{children}</>;
}

/** Scopes the doctor AuthProvider to /doctor/* only. */
function DoctorShell() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/**
 * Auth + registration, but NOT verification.
 *
 * The profile page has to stay reachable to an unverified doctor for two
 * real reasons: editing the registration number resets the account to
 * pending, so the full Gate would bounce the doctor away the instant they
 * saved — before they could read why — and a rejected doctor needs a way to
 * correct the details that got them rejected.
 */
function RegisteredGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasRegistered } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/doctor/login" replace />;
  }
  if (!hasRegistered) {
    return <Navigate to="/doctor/register" replace />;
  }
  return <>{children}</>;
}

export default function doctorRoutes() {
  return (
    <Route path="/doctor" element={<DoctorShell />}>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="pending" element={<PendingVerification />} />
      <Route
        element={
          <Gate>
            <AppLayout />
          </Gate>
        }
      >
        <Route index element={<MyPatients />} />
        <Route path="request-access" element={<RequestAccess />} />
        <Route path="patients/:profileId" element={<PatientRecordView />} />
      </Route>
      <Route
        element={
          <RegisteredGate>
            <AppLayout />
          </RegisteredGate>
        }
      >
        <Route path="profile" element={<Profile />} />
      </Route>
    </Route>
  );
}
