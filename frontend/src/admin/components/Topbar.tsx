import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';

const roleTone: Record<string, string> = {
  admin: 'bg-brand-lavender text-brand-purple',
  ocr_reviewer: 'bg-info-bg text-info',
  claims_ops: 'bg-warning-bg text-warning',
};

export default function Topbar({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { staff } = useAuth();
  const initials = staff?.phone_number ? staff.phone_number.slice(-2) : '?';

  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
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
