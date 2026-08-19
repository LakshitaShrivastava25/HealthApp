import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import PendingVerification from './pages/PendingVerification';
import MyPatients from './pages/MyPatients';
import RequestAccess from './pages/RequestAccess';
import PatientRecordView from './pages/PatientRecordView';

function Gate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasRegistered, doctor } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!hasRegistered) {
    return <Navigate to="/register" replace />;
  }
  if (doctor && doctor.verification_status !== 'verified') {
    return <Navigate to="/pending" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<PendingVerification />} />
      <Route
        element={
          <Gate>
            <AppLayout />
          </Gate>
        }
      >
        <Route path="/" element={<MyPatients />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="/patients/:profileId" element={<PatientRecordView />} />
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
