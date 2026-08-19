import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import DocumentReview from './pages/DocumentReview';
import InsurancePolicyReview from './pages/InsurancePolicyReview';
import DoctorVerification from './pages/DoctorVerification';
import Accounts from './pages/Accounts';
import AuditLog from './pages/AuditLog';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/documents" element={<DocumentReview />} />
        <Route path="/insurance-policies" element={<InsurancePolicyReview />} />
        <Route path="/doctor-verification" element={<DoctorVerification />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/audit-log" element={<AuditLog />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
