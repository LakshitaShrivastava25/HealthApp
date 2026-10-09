import { Outlet, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Overview from './pages/Overview';
import DocumentReview from './pages/DocumentReview';
import InsurancePolicyReview from './pages/InsurancePolicyReview';
import DoctorVerification from './pages/DoctorVerification';
import Patients from './pages/Patients';
import Accounts from './pages/Accounts';
import AuditLog from './pages/AuditLog';
import OtpSettings from './pages/OtpSettings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    // One sign-in screen for everyone; a staff number is sent back here.
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Scopes the admin AuthProvider to /admin/* only. */
function AdminShell() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default function adminRoutes() {
  return (
    <Route path="/admin" element={<AdminShell />}>
      {/* The old Admin Portal sign-in; everyone signs in at /login now. */}
      <Route path="login" element={<Navigate to="/login" replace />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Overview />} />
        <Route path="documents" element={<DocumentReview />} />
        <Route path="insurance-policies" element={<InsurancePolicyReview />} />
        <Route path="doctor-verification" element={<DoctorVerification />} />
        <Route path="patients" element={<Patients />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="otp-settings" element={<OtpSettings />} />
      </Route>
    </Route>
  );
}
