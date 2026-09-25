import { useState } from 'react';
import { CalendarClock, Check, X } from 'lucide-react';
import { Card, Button } from './ui';
import { availabilityApi } from '../lib/api';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type Availability = {
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
};

/**
 * The doctor's own clinic days and hours.
 *
 * Inline panel rather than a modal: the rest of this portal has no modal
 * pattern at all (Request Access is its own route), so a modal here would
 * be the only one in the app.
 *
 * Times use <input type="time">, matching the native date/time inputs
 * already used for the patient date-of-birth and premium due date fields.
 */
export default function ClinicAvailability({
  current,
  onSaved,
  onClose,
}: {
  current: Availability;
  onSaved: (next: Availability) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState<string[]>(current.available_days ?? []);
  // The API returns "09:00:00"; <input type="time"> wants "09:00".
  const [open, setOpen] = useState((current.clinic_open_time ?? '').slice(0, 5));
  const [close, setClose] = useState((current.clinic_close_time ?? '').slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothTimes = !!open && !!close;
  const timesInvalid = bothTimes && open >= close;

  function toggle(day: string) {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const { data } = await availabilityApi.update({
        available_days: days,
        clinic_open_time: open || null,
        clinic_close_time: close || null,
      });
      onSaved({
        available_days: data.available_days,
        clinic_open_time: data.clinic_open_time,
        clinic_close_time: data.clinic_close_time,
      });
      onClose();
    } catch (err: any) {
      // Surface the backend's real message (e.g. closing before opening)
      // rather than a generic failure.
      const d = err?.response?.data;
      const first = d && typeof d === 'object' ? Object.values(d)[0] : null;
      setError(Array.isArray(first) ? String(first[0]) : String(first ?? 'Could not save. Please try again.'));
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <CalendarClock size={15} className="text-accent-ink" /> Clinic availability
          </p>
          <p className="text-xs text-ink-500 mt-0.5">Shown to patients in Find Care alongside your booking number.</p>
        </div>
        <button onClick={onClose} className="text-ink-300 hover:text-ink-700" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <p className="text-xs font-semibold text-ink-700 mb-2">Available days</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {DAY_NAMES.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={on}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                on
                  ? 'bg-accent text-white border-accent'
                  : 'bg-card text-ink-500 border-border hover:border-accent'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div>
          <label htmlFor="clinic-open" className="mb-1.5 block text-xs font-semibold text-ink-700">Opens at</label>
          <input
            id="clinic-open"
            type="time"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label htmlFor="clinic-close" className="mb-1.5 block text-xs font-semibold text-ink-700">Closes at</label>
          <input
            id="clinic-close"
            type="time"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {timesInvalid && (
        <p className="mt-2 text-xs text-danger">Closing time must be after opening time.</p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="flex gap-2 mt-4">
        <Button onClick={handleSave} disabled={saving || timesInvalid}>
          <Check size={15} /> {saving ? 'Saving…' : 'Save availability'}
        </Button>
      </div>
    </Card>
  );
}
