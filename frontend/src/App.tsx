import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './landing/Landing';
import patientRoutes from './patient/PatientApp';
import doctorRoutes from './doctor/DoctorApp';
import adminRoutes from './admin/AdminApp';

/**
 * The one router for all four former apps.
 *
 * Each portal contributes its own <Route> subtree from its own file, so its
 * route list stays where it lived before and is still read in one place.
 * They are invoked as functions rather than rendered as <PatientRoutes />
 * because <Routes> only accepts <Route> elements as children — a component
 * wrapper would be silently ignored.
 *
 * Each subtree mounts its own AuthProvider, so the three portals keep
 * completely separate auth state and separate localStorage token keys,
 * exactly as they did when they were separate apps.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {patientRoutes()}
      {doctorRoutes()}
      {adminRoutes()}
      {/* Anything unrecognised goes back to the portal selector rather than
          rendering a blank screen. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
