import { type ReactNode } from 'react';
import AmbientBackground from '@shared/components/AmbientBackground';

export function Card({
  children,
  className = '',
  onClick,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /**
   * Whether this card responds to hover with a lift.
   *
   * Defaults to "does it handle its own click". Most clickable cards in this
   * app are NOT clicked via onClick though — they are wrapped in a <button>
   * or <Link> by the caller — so those pass `interactive` explicitly. A
   * static container (a form, a detail panel) gets no hover motion at all:
   * a lift with nothing behind it is a false affordance.
   */
  interactive?: boolean;
}) {
  // A card only lifts if something actually happens when you click it.
  const lifts = interactive ?? !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-card border border-border/60 rounded-xl2 shadow-lift ${
        lifts ? 'transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-liftHover' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between px-5 pt-5">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-ink-900">{title}</h3>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const toneClasses: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface text-ink-500',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  onClick,
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-sm',
    secondary: 'bg-accent-soft text-accent-ink hover:bg-accent-soft/70',
    ghost: 'bg-transparent text-ink-700 hover:bg-surface border border-border',
    danger: 'bg-danger-bg text-danger hover:bg-danger/10',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Avatar({ initials, size = 36 }: { initials: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-accent-soft text-accent-ink flex items-center justify-center font-semibold text-sm shrink-0"
    >
      {initials}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  note,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  /** For empty states inside a small card, where the full-height version
   *  would dwarf the card it sits in. */
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center justify-center text-center px-6 ${
        compact ? 'py-8' : 'py-14 sm:py-16'
      }`}
    >
      {/* Faint ambient art so an empty section reads as intentional rather
          than unfinished. Skipped in the compact variant — there is not
          enough height for it to be anything but clutter. */}
      {!compact && <AmbientBackground />}
      {/* Two concentric plates: a soft accent halo behind a solid disc, so the
          icon reads as a deliberate illustration rather than a stray glyph. */}
      <div className={`relative flex items-center justify-center ${compact ? "mb-3 h-12 w-12" : "mb-4 h-16 w-16"}`}>
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-accent-soft/60" />
        <span aria-hidden="true" className="absolute inset-2 rounded-full bg-accent-soft" />
        <span className="relative text-accent-ink">{icon}</span>
      </div>
      <p className="relative text-[15px] font-semibold tracking-tight text-ink-900">{title}</p>
      <p className="relative mt-1.5 max-w-xs text-sm leading-relaxed text-ink-500">{note}</p>
    </div>
  );
}
