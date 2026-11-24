import { ArrowLeft } from 'lucide-react';

/**
 * The "← Back" at the top of every sign-in and PIN step. Each step used to
 * rely on a small "change" link in its subtitle, or had no way back at all
 * (choosing a PIN), which left people stuck on a screen they did not want.
 */
export default function BackButton({
  onClick,
  label = 'Back',
  disabled,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-brand-purple disabled:opacity-50"
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}
