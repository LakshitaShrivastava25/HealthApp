/**
 * Date helpers shared by forms that must not accept a future date.
 *
 * Deliberately built from local date parts rather than toISOString(), which
 * formats in UTC: for anyone east of UTC (this app's users are in IST) that
 * can report yesterday's date late in the evening, and would then refuse
 * today as "in the future" in the one place the cap matters most.
 */

export function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today as yyyy-mm-dd, for a date input's `max`. */
export function todayIso() {
  return toIsoDate(new Date());
}
