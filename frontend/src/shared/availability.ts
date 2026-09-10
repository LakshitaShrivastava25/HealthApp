/**
 * Formatting for a doctor's clinic days and hours.
 *
 * Lives in shared/ because the patient-facing Find Care card and the Admin
 * Portal's doctor list must describe the same data identically — two copies
 * would drift, and "Mon–Fri" meaning different things in two screens is
 * exactly the kind of quiet inconsistency that erodes trust in the data.
 */

export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

const SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

/**
 * "Mon–Fri" when the days form one unbroken run in week order, otherwise a
 * plain list ("Mon, Wed, Fri"). Returns null when nothing is set, so callers
 * can show an honest "not listed yet" rather than an empty string.
 */
export function formatDays(days: string[] | null | undefined): string | null {
  if (!days || days.length === 0) return null;

  const idx = days
    .map((d) => DAY_NAMES.indexOf(d as (typeof DAY_NAMES)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idx.length === 0) return null;
  if (idx.length === 1) return SHORT[DAY_NAMES[idx[0]]];

  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous) return `${SHORT[DAY_NAMES[idx[0]]]}–${SHORT[DAY_NAMES[idx[idx.length - 1]]]}`;
  return idx.map((i) => SHORT[DAY_NAMES[i]]).join(', ');
}

/** "09:00:00" -> "9:00 AM". Tolerates the "09:00" form too. */
function to12Hour(value: string): string | null {
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * "9:00 AM – 5:00 PM". Null unless BOTH ends are known — a half-set range
 * ("9:00 AM – ?") tells a patient nothing useful about when to turn up.
 */
export function formatHours(
  open: string | null | undefined,
  close: string | null | undefined,
): string | null {
  if (!open || !close) return null;
  const a = to12Hour(open);
  const b = to12Hour(close);
  return a && b ? `${a} – ${b}` : null;
}
