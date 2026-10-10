import { useNavigate } from 'react-router-dom';
import { Stethoscope, User } from 'lucide-react';

import type { Mode } from './client';
import { homeFor } from './mode';
import { useSession } from './SessionContext';

const OPTIONS: { mode: Mode; label: string; Icon: typeof User; active: string }[] = [
  { mode: 'patient', label: 'User', Icon: User, active: 'bg-brand-purple text-white' },
  { mode: 'doctor', label: 'Doctor', Icon: Stethoscope, active: 'bg-brand-teal text-white' },
];

/**
 * The User / Doctor switch — the same control the mobile app shows once an
 * account has registered as a doctor. Nothing renders before that: the
 * "Register as a doctor" entry in the User-mode sidebar is the way in.
 *
 * Switching is a route change. Both modes run on the one signed-in session
 * (SessionContext), so there is nothing to sign in to again.
 *
 * Labels show from `sm` up; `labels` shows them on phones too, where the
 * headers give the switch a row of its own.
 */
export default function ModeSwitch({ className = '', labels = false }: { className?: string; labels?: boolean }) {
  const { hasRegistered, mode } = useSession();
  const navigate = useNavigate();

  if (!hasRegistered) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Switch between User and Doctor mode"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 ${className}`}
    >
      {OPTIONS.map(({ mode: option, label, Icon, active }) => {
        const selected = option === mode;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} mode`}
            title={selected ? `You are in ${label} mode` : `Switch to ${label} mode`}
            onClick={() => !selected && navigate(homeFor(option))}
            className={`flex items-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40 sm:px-3 ${
              labels ? 'px-3' : 'px-2.5'
            } ${selected ? `${active} shadow-sm` : 'text-ink-500 hover:bg-card hover:text-ink-900'}`}
          >
            <Icon size={14} strokeWidth={2.2} />
            <span className={labels ? '' : 'hidden sm:inline'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
