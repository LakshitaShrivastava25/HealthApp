import { Routes, Route, Navigate } from 'react-router-dom';
import { Sparkles, FileBarChart, LifeBuoy } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HealthTimeline from './pages/HealthTimeline';
import MedicalLocker from './pages/MedicalLocker';
import Insurance from './pages/Insurance';
import Medicines from './pages/Medicines';
import FindCare from './pages/FindCare';
import EmergencyCard from './pages/EmergencyCard';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/timeline" element={<HealthTimeline />} />
        <Route path="/locker" element={<MedicalLocker />} />
        <Route path="/insurance" element={<Insurance />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/find-care" element={<FindCare />} />
        <Route path="/emergency" element={<EmergencyCard />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/health-ai"
          element={
            <ComingSoon
              title="Health AI"
              subtitle="Your full AI health assistant, in one place"
              icon={Sparkles}
              note="The dashboard's quick-ask box already talks to this assistant — a dedicated full-screen chat view lands here next."
            />
          }
        />
        <Route
          path="/reports"
          element={
            <ComingSoon
              title="Reports"
              subtitle="Trends and summaries across your health data"
              icon={FileBarChart}
              note="Monthly AI health reports and analytics are planned for a later phase."
            />
          }
        />
        <Route
          path="/help"
          element={
            <ComingSoon
              title="Help & Support"
              subtitle="Get help or reach the HealthNow team"
              icon={LifeBuoy}
              note="A help center and support contact form will live here."
            />
          }
        />
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
