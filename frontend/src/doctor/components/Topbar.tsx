import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge } from './ui';
import { MobileMenuButton } from '@shared/layout/ResponsiveShell';
import AmbientBackground from '@shared/components/AmbientBackground';

const statusTone: Record<string, 'success' | 'warning' | 'danger'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
};

export default function Topbar({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { doctor } = useAuth();
  const initials = doctor?.full_name
    ? doctor.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <header className="relative overflow-hidden sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2">
      {/* Header-variant ambient art: 3 small icons, far right, so it
          never sits under the page title itself. */}
      <AmbientBackground variant="header" />
      <div className="relative flex min-w-0 flex-1 items-center gap-2">
        <MobileMenuButton />
        <div className="min-w-0">
          <h1 className="truncate text-base sm:text-lg lg:text-xl font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="hidden sm:block truncate text-sm text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <div className="order-last flex w-full flex-wrap items-center justify-end gap-2 sm:order-none sm:w-auto">
          {action}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {doctor && (
          <Link
            to="/doctor/profile"
            title="View and edit your profile"
            className="flex items-center gap-2.5 pl-3 border-l border-border rounded-lg -mr-1 pr-1 py-1 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Avatar initials={initials} size={34} />
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-ink-900 leading-tight">Dr. {doctor.full_name}</p>
              <Badge tone={statusTone[doctor.verification_status] || 'warning'}>{doctor.verification_status}</Badge>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}
