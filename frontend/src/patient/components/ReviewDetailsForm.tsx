import { Check, ClipboardCheck } from 'lucide-react';
import { todayIso } from '@shared/dates';

/**
 * The "Review what we read from this document" form.
 *
 * Moved out of DocumentDetailModal unchanged so two flows can share it: the
 * original one, where it edits a document already saved and awaiting review,
 * and the Medical Locker upload, where it collects the same details BEFORE
 * the file is sent. Markup, classes and wording are exactly as they were —
 * this is a move, not a redesign.
 */

export const CATEGORIES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'report', label: 'Report' },
  { value: 'scan', label: 'Scan' },
  { value: 'discharge', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

export type ReviewValues = {
  title: string;
  category: string;
  date: string;
  hospital: string;
  doctor: string;
};

export default function ReviewDetailsForm({
  values,
  onChange,
  intro,
  suggestedTitle,
  keyValues,
  error,
  busy,
  busyLabel = 'Saving...',
  confirmLabel = 'Confirm these details are correct',
  onConfirm,
  children,
}: {
  values: ReviewValues;
  onChange: (patch: Partial<ReviewValues>) => void;
  /** The line under the heading. The upload flow says something different
   *  because nothing has been read yet. */
  intro: string;
  suggestedTitle?: string;
  keyValues?: { label: string; value: string }[];
  error?: string;
  busy: boolean;
  busyLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Slot above the button — the upload flow puts its progress bar here. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/40 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
        <ClipboardCheck size={15} className="text-warning" />
        Review what we read from this document
      </p>
      <p className="mt-1 text-xs text-ink-500">{intro}</p>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="rv-title" className="mb-1 block text-[11px] font-semibold text-ink-700">Title</label>
          <input
            id="rv-title"
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
          {/* Upload stores the filename as the title, and the
              blank-only rule means the AI's nicer title is never
              written over it. Rather than lose that suggestion,
              offer it — the person still chooses. */}
          {suggestedTitle && suggestedTitle !== values.title ? (
            <button
              type="button"
              onClick={() => onChange({ title: suggestedTitle })}
              className="mt-1 text-[11px] text-accent-ink hover:underline"
            >
              Use suggested title: “{suggestedTitle}”
            </button>
          ) : null}
        </div>
        <div>
          <label htmlFor="rv-cat" className="mb-1 block text-[11px] font-semibold text-ink-700">Category</label>
          <select
            id="rv-cat"
            value={values.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rv-date" className="mb-1 block text-[11px] font-semibold text-ink-700">Document date</label>
          {/* Native date input, matching date_of_birth and
              premium_due_date elsewhere in this app. Capped at
              today: a report cannot have been taken in the
              future. The same rule is enforced server-side,
              because the picker can be bypassed. */}
          <input
            id="rv-date"
            type="date"
            max={todayIso()}
            value={values.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label htmlFor="rv-hosp" className="mb-1 block text-[11px] font-semibold text-ink-700">Hospital / source</label>
          <input
            id="rv-hosp"
            value={values.hospital}
            onChange={(e) => onChange({ hospital: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label htmlFor="rv-doc" className="mb-1 block text-[11px] font-semibold text-ink-700">Doctor</label>
          <input
            id="rv-doc"
            value={values.doctor}
            onChange={(e) => onChange({ doctor: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {/* Readings the AI pulled out. structured_data is a JSON
          blob, not columns — key_values is a key inside it — so
          these are shown for checking and corrected through the
          existing "Correct a field" editor below. */}
      {keyValues && keyValues.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-ink-700">Readings found</p>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {keyValues.map((kv, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="text-ink-500">{kv.label}</span>
                <span className="font-medium text-ink-900">{kv.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {children}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <button
        onClick={onConfirm}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
      >
        <Check size={13} />
        {busy ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}
