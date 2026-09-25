import ResponsiveShell from '@shared/layout/ResponsiveShell';
import Sidebar from '../components/Sidebar';

/** Shell mechanics (drawer below lg, persistent at lg+) are shared; the
 *  sidebar itself stays this portal's own. */
export default function AppLayout() {
  return <ResponsiveShell portal="admin" sidebar={<Sidebar />} />;
}
