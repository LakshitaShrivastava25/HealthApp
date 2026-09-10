import { ShieldCheck } from 'lucide-react';

/**
 * The reassurance line under the primary action.
 *
 * Deliberately quiet: this is a healthcare login, and a badge that shouts
 * about encryption reads as compensating for something. A small lock, a
 * slow glow, and the claim stated plainly.
 */
export default function SecurityBadge({ label = 'Secured & encrypted' }: { label?: string }) {
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span
          aria-hidden="true"
          className="hn-glow-pulse absolute inset-0 rounded-full bg-brand-teal/30 blur-[6px]"
        />
        <ShieldCheck size={13} className="relative text-brand-teal" strokeWidth={2.5} />
      </span>
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
    </div>
  );
}
