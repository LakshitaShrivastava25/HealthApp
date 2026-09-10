import { useId } from 'react';
import { Phone } from 'lucide-react';
import { COUNTRIES, type Country } from '@shared/data/countries';

export const BOOKING_PHONE_MIN_DIGITS = 6;
export const BOOKING_PHONE_MAX_DIGITS = 15;
// [0-9] rather than \d on purpose: inside a template literal an
// unrecognised escape collapses, so `\d` would ship as a bare "d" and
// the pattern would validate nothing. [0-9] needs no escaping.
const BOOKING_PHONE_PATTERN = `[0-9]{${BOOKING_PHONE_MIN_DIGITS},${BOOKING_PHONE_MAX_DIGITS}}`;

/**
 * Country code + number for the patient-facing booking line.
 *
 * Deliberately NOT the shared PhoneInput/usePhoneInput pair. That component
 * exists for the OTP login number and hard-caps input at the selected
 * country's exact digit count (`slice(0, country.digits)`), which is right
 * for a mobile you must verify by SMS and wrong here: a landline is a
 * variable-length STD/area code plus a subscriber number, so an exact count
 * would reject real clinic numbers. The COUNTRIES list is reused as-is —
 * only the per-country `digits` restriction is dropped.
 */
export default function BookingPhoneField({
  country,
  onCountryChange,
  digits,
  onDigitsChange,
}: {
  country: Country;
  onCountryChange: (c: Country) => void;
  digits: string;
  onDigitsChange: (d: string) => void;
}) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        Booking phone number (shown to patients to book appointments)
      </label>

      <div className="group relative flex items-center gap-2 rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        <span className="pl-3.5 text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple">
          <Phone size={15} />
        </span>
        <select
          aria-label="Country code"
          value={`${country.iso}-${country.dialCode}`}
          onChange={(e) => {
            const next = COUNTRIES.find((c) => `${c.iso}-${c.dialCode}` === e.target.value);
            // Unlike the login field, the typed number is NOT cleared on a
            // country change: no exact digit count is being enforced, so what
            // is already typed stays valid.
            if (next) onCountryChange(next);
          }}
          className="shrink-0 max-w-[104px] bg-transparent py-3 text-sm text-ink-900 outline-none"
        >
          {COUNTRIES.map((c) => (
            <option key={`${c.iso}-${c.dialCode}`} value={`${c.iso}-${c.dialCode}`}>
              {c.dialCode} {c.iso}
            </option>
          ))}
        </select>
        <input
          id={id}
          value={digits}
          // Strip anything that isn't a digit rather than rejecting it, so a
          // pasted "+91 98765-43210" becomes usable instead of failing.
          onChange={(e) =>
            onDigitsChange(e.target.value.replace(/\D/g, '').slice(0, BOOKING_PHONE_MAX_DIGITS))
          }
          type="tel"
          inputMode="numeric"
          // The browser blocks submit on this pattern before any request.
          pattern={BOOKING_PHONE_PATTERN}
          title={`Enter ${BOOKING_PHONE_MIN_DIGITS} to ${BOOKING_PHONE_MAX_DIGITS} digits, without the country code.`}
          required
          placeholder="98765 43210"
          className="w-full min-w-0 bg-transparent py-3 pr-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-300"
        />
      </div>

      <p className="mt-1.5 text-[11px] text-ink-500">
        Mobile or landline. Separate from your private login number — patients will see this one.
      </p>
    </div>
  );
}
