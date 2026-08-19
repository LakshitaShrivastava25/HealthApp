import { NavLink, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/timeline', label: 'Health Timeline', icon: History },
  { to: '/locker', label: 'Medical Locker', icon: FolderHeart },
  { to: '/insurance', label: 'Insurance', icon: ShieldCheck },
  { to: '/medicines', label: 'Medicines', icon: Pill },
  { to: '/find-care', label: 'Find Care', icon: Search },
  { to: '/emergency', label: 'Emergency Card', icon: QrCode },
  { to: '/health-ai', label: 'Health AI', icon: Sparkles },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/help', label: 'Help & Support', icon: LifeBuoy },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-card border-r border-border flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-lg bg-brand-teal flex items-center justify-center text-white">
          <HeartPulse size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-ink-900 leading-tight">HealthNow</p>
          <p className="text-[11px] text-ink-500 leading-tight">Your Health, Our Priority</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-lavender text-brand-purple'
                  : 'text-ink-700 hover:bg-surface'
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
