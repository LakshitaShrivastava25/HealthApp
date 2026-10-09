import { Link, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  History,
  FolderHeart,
  ShieldCheck,
  Pill,
  Search,
  QrCode,
  Sparkles,
  FileBarChart,
  Settings as SettingsIcon,
  LifeBuoy,
  LogOut,
  HeartPulse,
  UserCheck,
  Stethoscope,
  ChevronRight,
} from 'lucide-react';
import ModeSwitch from '@shared/session/ModeSwitch';
import { useAuth } from '../context/AuthContext';
import { useLogoutConfirm } from '@shared/hooks/useLogoutConfirm';

const navItems = [
  { to: '/patient', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/patient/timeline', label: 'Health Timeline', icon: History },
  { to: '/patient/locker', label: 'Medical Locker', icon: FolderHeart },
  { to: '/patient/insurance', label: 'Insurance', icon: ShieldCheck },
  { to: '/patient/medicines', label: 'Medicines', icon: Pill },
  { to: '/patient/find-care', label: 'Find Care', icon: Search },
  { to: '/patient/emergency', label: 'Emergency Card', icon: QrCode },
  { to: '/patient/doctor-access', label: 'Doctor Access', icon: UserCheck },
  { to: '/patient/health-ai', label: 'Health AI', icon: Sparkles },
  { to: '/patient/reports', label: 'Reports', icon: FileBarChart },
  { to: '/patient/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/patient/help', label: 'Help & Support', icon: LifeBuoy },
];

export default function Sidebar() {
  const { logout, hasRegistered } = useAuth();
  // Asks first, then ends the session with a hard navigation to /login.
  const { requestLogout, dialog: logoutDialog } = useLogoutConfirm(logout);

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-card border-r border-border flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-teal to-brand-purple flex items-center justify-center text-white shadow-sm">
          <HeartPulse size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-ink-900 leading-tight">CuraPath</p>
          <p className="text-[11px] text-ink-500 leading-tight">Your Health, Our Priority</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/patient'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-ink-700 hover:bg-surface'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-border space-y-2">
        {/* The way into Doctor mode, as on the app's More tab: register
            first, then the switch takes this entry's place. */}
        {hasRegistered ? (
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-xs font-semibold text-ink-500">Mode</span>
            <ModeSwitch />
          </div>
        ) : (
          <Link
            to="/doctor/register"
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-brand-teal/50 hover:bg-surface"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Stethoscope size={16} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">Register as a doctor</span>
              <span className="block text-[11px] leading-snug text-ink-500">Verified by our team before approval</span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-ink-300" />
          </Link>
        )}
        {logoutDialog}
        <button
          onClick={requestLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-surface hover:text-danger transition-colors"
        >
          <LogOut size={18} strokeWidth={2} />
          Logout
        </button>
      </div>
    </aside>
  );
}
