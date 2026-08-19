import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge } from './ui';

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
    <header className="sticky top-0 z-10 bg-card border-b border-border px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {action}
        {doctor && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-border">
            <Avatar initials={initials} size={34} />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-ink-900 leading-tight">Dr. {doctor.full_name}</p>
              <Badge tone={statusTone[doctor.verification_status] || 'warning'}>{doctor.verification_status}</Badge>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
