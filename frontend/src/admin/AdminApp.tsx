import { Outlet, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import AdminLogin from './pages/AdminLogin';
import PageFallback from '@shared/components/PageFallback';
import { lazyPage } from '@shared/lazyPage';

const Overview = lazyPage('admin', () => import('./pages/Overview'));
const DocumentReview = lazyPage('admin', () => import('./pages/DocumentReview'));
const InsurancePolicyReview = lazyPage('admin', () => import('./pages/InsurancePolicyReview'));
const DoctorVerification = lazyPage('admin', () => import('./pages/DoctorVerification'));
const Patients = lazyPage('admin', () => import('./pages/Patients'));
const Accounts = lazyPage('admin', () => import('./pages/Accounts'));
const AuditLog = lazyPage('admin', () => import('./pages/AuditLog'));
const OtpSettings = lazyPage('admin', () => import('./pages/OtpSettings'));

/**
 * Signed out: the Admin Portal's own email + password sign-in, shown right
 * here at the address that was asked for (curapath.in/admin, or a deep link
 * like /admin/doctor-verification), so after signing in the person is
 * already on that page. OTP sign-in at /login still works for staff too.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageFallback fullScreen />;
  if (!isAuthenticated) return <AdminLogin />;
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
      {/* The sign-in form is shown at /admin itself. */}
      <Route path="login" element={<Navigate to="/admin" replace />} />
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
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Route>
  );
}
