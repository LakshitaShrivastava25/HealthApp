import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import useClickOutside from '@shared/useClickOutside';

/**
 * A friendly clock-face time picker.
 *
 * The native <input type="time"> it replaces shows 24-hour scrolling columns,
 * which people reading "20:00" have to translate before they trust it. This
 * asks the question the way a clock does: tap the hour on the dial, then the
 * minute, with AM/PM spelled out.
 *
 * `value` and `onChange` stay on a 24-hour "HH:mm" string, which is what the
 * API stores — the 12-hour reading exists only on screen.
 */

/** "20:00" -> "8:00 PM". Returns the input unchanged if it isn't a time. */
export function to12Hour(value: string) {
  const [hour, minute] = (value ?? '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Clock-face order: 12 sits at the top, then clockwise. */
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const QUICK_PICKS = [
  { label: 'Morning', time: '08:00' },
  { label: 'Afternoon', time: '14:00' },
  { label: 'Evening', time: '18:00' },
  { label: 'Night', time: '21:00' },
];

// Centre-to-number distance, as a percentage of the dial box.
const RADIUS = 38;

/** Where the number at `index` sits on the dial, in box percentages. */
function dialPosition(index: number) {
  const radians = ((index * 30 - 90) * Math.PI) / 180;
  return { x: 50 + RADIUS * Math.cos(radians), y: 50 + RADIUS * Math.sin(radians) };
}

function parse(value: string) {
  const [hour, minute] = (value ?? '').split(':').map(Number);
  const safeHour = Number.isInteger(hour) ? Math.min(23, Math.max(0, hour)) : 8;
  const safeMinute = Number.isInteger(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  return { hour: safeHour, minute: safeMinute };
}

function compose(hour12: number, minute: number, isPm: boolean) {
  const hour24 = (hour12 % 12) + (isPm ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function TimePicker({
  value,
  onChange,
  label = 'Reminder time',
}: {
  /** 24-hour "HH:mm". */
  value: string;
  onChange: (next: string) => void;
  /** Used for the trigger's accessible name, not drawn as text. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Which dial is showing. Reset on every open so it always starts at the
  // hour, the way the Android picker does.
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapRef, open, () => setOpen(false));

  const { hour, minute } = parse(value);
  const isPm = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  // Move focus into the panel when it opens, so a keyboard user carries on
  // from where they pressed instead of tabbing through the page again.
  useEffect(() => {
    if (!open) return;
    setMode('hour');
    panelRef.current?.querySelector<HTMLButtonElement>('[data-dial-selected="true"]')?.focus();
  }, [open]);

  function pickHour(nextHour12: number) {
    onChange(compose(nextHour12, minute, isPm));
    setMode('minute');
  }

  function pickMinute(nextMinute: number) {
    onChange(compose(hour12, nextMinute, isPm));
  }

  function setMeridiem(nextIsPm: boolean) {
    if (nextIsPm === isPm) return;
    onChange(compose(hour12, minute, nextIsPm));
  }

  const numbers = mode === 'hour' ? HOURS : MINUTES;
  const selectedIndex = mode === 'hour' ? HOURS.indexOf(hour12) : MINUTES.indexOf(minute);
  // An off-five minute (from a prescription, or an older entry) has no mark
  // on the dial; the hand still points at it rather than snapping.
  const handAngle = mode === 'hour' ? HOURS.indexOf(hour12) * 30 : (minute / 60) * 360;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${to12Hour(value)}`}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          open ? 'border-accent bg-accent-soft/60 text-accent-ink' : 'border-border bg-card text-ink-900 hover:border-accent/50'
        }`}
      >
        <Clock3 size={15} className={open ? 'text-accent' : 'text-ink-300'} />
        <span className="font-medium tabular-nums">{to12Hour(value)}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-2 w-[17.5rem] max-w-[calc(100vw-2rem)] rounded-xl2 border border-border bg-card p-4 shadow-liftHover"
        >
          {/* Quick picks — most reminders are one of these four. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK_PICKS.map((pick) => {
              const active = value === pick.time;
              return (
                <button
                  key={pick.time}
                  type="button"
                  onClick={() => onChange(pick.time)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-accent text-white'
                      : 'bg-accent-soft/70 text-accent-ink hover:bg-accent-soft'
                  }`}
                >
                  {pick.label} {to12Hour(pick.time)}
                </button>
              );
            })}
          </div>

          {/* Readout. The hour and minute double as the dial switch. */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setMode('hour')}
              aria-label="Set the hour"
              className={`rounded-lg px-2 py-1 text-3xl font-semibold tabular-nums transition-colors ${
                mode === 'hour' ? 'bg-accent-soft text-accent-ink' : 'text-ink-300 hover:text-ink-700'
              }`}
            >
              {String(hour12).padStart(2, '0')}
            </button>
            <span className="text-3xl font-semibold text-ink-300">:</span>
            <button
              type="button"
              onClick={() => setMode('minute')}
              aria-label="Set the minutes"
              className={`rounded-lg px-2 py-1 text-3xl font-semibold tabular-nums transition-colors ${
                mode === 'minute' ? 'bg-accent-soft text-accent-ink' : 'text-ink-300 hover:text-ink-700'
              }`}
            >
              {String(minute).padStart(2, '0')}
            </button>
            <div className="ml-1 flex flex-col overflow-hidden rounded-lg border border-border">
              {[false, true].map((pm) => (
                <button
                  key={pm ? 'PM' : 'AM'}
                  type="button"
                  onClick={() => setMeridiem(pm)}
                  aria-pressed={isPm === pm}
                  className={`px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    isPm === pm ? 'bg-accent text-white' : 'bg-card text-ink-500 hover:bg-accent-soft/60'
                  }`}
                >
                  {pm ? 'PM' : 'AM'}
                </button>
              ))}
            </div>
          </div>

          {/* The dial. */}
          <div className="relative mx-auto aspect-square w-[13rem] rounded-full bg-accent-soft/50">
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
              <circle cx="50" cy="50" r="2.5" className="fill-accent" />
              <g
                style={{
                  transform: `rotate(${handAngle}deg)`,
                  transformOrigin: '50% 50%',
                  transition: 'transform 200ms ease-out',
                }}
              >
                <line x1="50" y1="50" x2="50" y2={50 - RADIUS} strokeWidth="1.5" className="stroke-accent" />
                <circle cx="50" cy={50 - RADIUS} r="8" className="fill-accent" />
              </g>
            </svg>

            {numbers.map((number, index) => {
              const { x, y } = dialPosition(index);
              const selected = index === selectedIndex;
              return (
                <button
                  key={number}
                  type="button"
                  data-dial-selected={selected}
                  onClick={() => (mode === 'hour' ? pickHour(number) : pickMinute(number))}
                  aria-label={mode === 'hour' ? `${number} o'clock` : `${number} minutes`}
                  className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold tabular-nums outline-offset-2 transition-colors ${
                    selected ? 'text-white' : 'text-ink-700 hover:bg-card/80'
                  }`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  {mode === 'hour' ? number : String(number).padStart(2, '0')}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-ink-500">
              {mode === 'hour' ? 'Pick the hour' : 'Now pick the minutes'}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
