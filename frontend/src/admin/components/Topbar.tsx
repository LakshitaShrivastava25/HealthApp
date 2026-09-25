import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import { MobileMenuButton } from '@shared/layout/ResponsiveShell';
import AmbientBackground from '@shared/components/AmbientBackground';

const roleTone: Record<string, string> = {
  admin: 'bg-accent-soft text-accent-ink',
  ocr_reviewer: 'bg-info-bg text-info',
  claims_ops: 'bg-warning-bg text-warning',
};

export default function Topbar({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { staff } = useAuth();
  const initials = staff?.phone_number ? staff.phone_number.slice(-2) : '?';

  return (
    <header className="relative overflow-hidden sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
      {/* Header-variant ambient art: 3 small icons, far right, so it
          never sits under the page title itself. */}
      <AmbientBackground variant="header" />
      <div className="relative flex min-w-0 items-center gap-2">
        <MobileMenuButton />
        <div className="min-w-0">
          <h1 className="truncate text-base sm:text-lg lg:text-xl font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="hidden sm:block truncate text-sm text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {action}
        {staff && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-border">
            <Avatar initials={initials} size={34} />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-ink-900 leading-tight">{staff.phone_number}</p>
              <span
                className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                  roleTone[staff.role] || 'bg-surface text-ink-500'
                }`}
              >
                {staff.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
