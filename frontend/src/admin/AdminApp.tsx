import { Outlet, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import DocumentReview from './pages/DocumentReview';
import InsurancePolicyReview from './pages/InsurancePolicyReview';
import DoctorVerification from './pages/DoctorVerification';
import Patients from './pages/Patients';
import Accounts from './pages/Accounts';
import AuditLog from './pages/AuditLog';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
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
      <Route path="login" element={<Login />} />
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
      </Route>
    </Route>
  );
}
