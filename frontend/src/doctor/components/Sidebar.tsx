import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UserPlus, LogOut, Stethoscope, UserCog } from 'lucide-react';
import ModeSwitch from '@shared/session/ModeSwitch';
import { useAuth } from '../context/AuthContext';
import { useLogoutConfirm } from '@shared/hooks/useLogoutConfirm';

const navItems = [
  { to: '/doctor', label: 'My Patients', icon: LayoutDashboard },
  { to: '/doctor/request-access', label: 'Request Access', icon: UserPlus },
  { to: '/doctor/profile', label: 'My Profile', icon: UserCog },
];

export default function Sidebar() {
  const { logout, doctor } = useAuth();
  const verified = doctor?.verification_status === 'verified';

  // Asks first, then ends the session with a hard navigation to /login.
  const { requestLogout, dialog: logoutDialog } = useLogoutConfirm(logout);

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-card border-r border-border flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-teal to-brand-purple flex items-center justify-center text-white shadow-sm">
          <Stethoscope size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-ink-900 leading-tight">CuraPath Doctor</p>
          <p className="text-[11px] text-accent-ink font-medium leading-tight truncate max-w-[150px]">
            Dr. {doctor?.full_name}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {/* Patients and requests need a verified registration; the profile
            stays reachable so a pending or rejected doctor can fix it. */}
        {navItems.filter(({ to }) => verified || to === '/doctor/profile').map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/doctor'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-l-[3px] ${
                isActive
                  ? 'bg-accent-soft text-accent-ink border-accent'
                  : 'text-ink-700 hover:bg-surface border-transparent'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between gap-2 px-3 py-1">
          <span className="text-xs font-semibold text-ink-500">Mode</span>
          <ModeSwitch />
        </div>
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
