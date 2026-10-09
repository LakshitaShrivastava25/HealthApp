import { Route, Navigate, useLocation } from 'react-router-dom';
import { Sparkles, FileBarChart } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import SessionStatus from '../auth/SessionStatus';
import { lazyPage } from '@shared/lazyPage';

const ProfileSetup = lazyPage('patient', () => import('./pages/ProfileSetup'));
const Dashboard = lazyPage('patient', () => import('./pages/Dashboard'));
const HealthTimeline = lazyPage('patient', () => import('./pages/HealthTimeline'));
const MedicalLocker = lazyPage('patient', () => import('./pages/MedicalLocker'));
const Insurance = lazyPage('patient', () => import('./pages/Insurance'));
const Medicines = lazyPage('patient', () => import('./pages/Medicines'));
const FindCare = lazyPage('patient', () => import('./pages/FindCare'));
const EmergencyCard = lazyPage('patient', () => import('./pages/EmergencyCard'));
const DoctorAccess = lazyPage('patient', () => import('./pages/DoctorAccess'));
const Settings = lazyPage('patient', () => import('./pages/Settings'));
const ComingSoon = lazyPage('patient', () => import('./pages/ComingSoon'));
const HelpSupport = lazyPage('patient', () => import('./pages/HelpSupport'));

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
      <Route path="*" element={<Navigate to="/patient" replace />} />
    </Route>
  );
}
