import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * A labelled text input with the auth flow's focus treatment.
 *
 * Every field gets a real <label htmlFor> rather than a placeholder doing
 * double duty — placeholder-as-label vanishes the moment someone starts
 * typing, which is exactly when a person filling a medical form wants to
 * check what the field was.
 *
 * The focus state is a border colour change plus a soft ring. It is
 * driven by :focus-within on the wrapper so the icon can highlight at the
 * same time without any JS.
 */
export default function Field({
  label,
  icon,
  hint,
  trailing,
  className = '',
  ...input
}: {
  label: string;
  icon?: ReactNode;
  hint?: string;
  /** Something inside the field's right edge, e.g. a show-password toggle. */
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = input.id ?? autoId;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}
      </label>

      <div className="group relative flex items-center rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        {icon && (
          <span className="pl-3.5 text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple">
            {icon}
          </span>
        )}
        <input
          {...input}
          id={id}
          className={`w-full bg-transparent py-3 text-sm text-ink-900 outline-none placeholder:text-ink-300 ${
            icon ? 'pl-2.5' : 'pl-3.5'
          } ${trailing ? 'pr-1' : 'pr-3.5'}`}
        />
        {trailing && <span className="flex shrink-0 items-center pr-1.5">{trailing}</span>}
      </div>

      {hint && <p className="mt-1.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
