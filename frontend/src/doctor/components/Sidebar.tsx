import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UserPlus, LogOut, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/doctor', label: 'My Patients', icon: LayoutDashboard },
  { to: '/doctor/request-access', label: 'Request Access', icon: UserPlus },
];

export default function Sidebar() {
  const { logout, doctor } = useAuth();

  function handleLogout() {
    logout();
    // A hard navigation, not react-router's navigate(): clearing the tokens
    // flips isAuthenticated, and the RequireAuth/Gate wrapper this button
    // lives inside re-renders immediately and redirects to the portal's own
    // login — winning the race against a client-side navigate and stranding
    // the person there instead of on the landing selector.
    //
    // It is also the stronger choice for a logout on a shared machine: a
    // full document load discards all in-memory auth state, any request
    // still in flight, and the module-level refresh queue, so nothing can
    // survive into the next person's session.
    window.location.assign('/');
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-card border-r border-border flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-teal to-brand-purple flex items-center justify-center text-white shadow-sm">
          <Stethoscope size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-ink-900 leading-tight">HealthNow Doctor</p>
          <p className="text-[11px] text-accent-ink font-medium leading-tight truncate max-w-[150px]">
            Dr. {doctor?.full_name}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
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

      <div className="px-3 pb-5 pt-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-surface hover:text-danger transition-colors"
        >
          <LogOut size={18} strokeWidth={2} />
          Logout
        </button>
      </div>
    </aside>
  );
}
