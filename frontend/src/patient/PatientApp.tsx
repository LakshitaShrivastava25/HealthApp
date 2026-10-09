import { Route, Navigate, useLocation } from 'react-router-dom';
import { Sparkles, FileBarChart } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import SessionStatus from '../auth/SessionStatus';
import ProfileSetup from './pages/ProfileSetup';
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

/**
 * User mode's gate. Signed out → the one sign-in screen, remembering where
 * they were going. Signed in without a profile of their own → profile setup:
 * every record hangs off a profile, so there is nothing to show without one.
 */
function RequireProfile({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loadFailed, profiles } = useAuth();
  const location = useLocation();
  if (isLoading || loadFailed) return <SessionStatus />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (profiles.length === 0) return <Navigate to="/patient/setup" replace />;
  return <>{children}</>;
}

export default function patientRoutes() {
  return (
    <Route path="/patient">
      {/* The old User Portal sign-in; everyone signs in at /login now. */}
      <Route path="login" element={<Navigate to="/login" replace />} />
      <Route path="setup" element={<ProfileSetup />} />
      <Route
        element={
          <RequireProfile>
            <AppLayout />
          </RequireProfile>
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
