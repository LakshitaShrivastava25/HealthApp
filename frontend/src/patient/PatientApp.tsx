import { Outlet, Route, Navigate, useLocation } from 'react-router-dom';
import { Sparkles, FileBarChart } from 'lucide-react';
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
import DoctorAccess from './pages/DoctorAccess';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import HelpSupport from './pages/HelpSupport';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading...</div>;
  }
  if (!isAuthenticated) {
    // Carry where they were actually going, so signing in returns them
    // there instead of silently dropping everyone on the dashboard.
    return <Navigate to="/patient/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Scopes the patient AuthProvider to /patient/* only — each portal keeps
 *  its own provider and its own localStorage token keys, exactly as before. */
function PatientShell() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default function patientRoutes() {
  return (
    <Route path="/patient" element={<PatientShell />}>
      <Route path="login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="timeline" element={<HealthTimeline />} />
        <Route path="locker" element={<MedicalLocker />} />
        <Route path="insurance" element={<Insurance />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="find-care" element={<FindCare />} />
        <Route path="emergency" element={<EmergencyCard />} />
        <Route path="doctor-access" element={<DoctorAccess />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="health-ai"
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
          path="reports"
          element={
            <ComingSoon
              title="Reports"
              subtitle="Trends and summaries across your health data"
              icon={FileBarChart}
              note="Monthly AI health reports and analytics are planned for a later phase."
            />
          }
        />
        <Route path="help" element={<HelpSupport />} />
      </Route>
    </Route>
  );
}
