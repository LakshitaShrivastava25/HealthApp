import { useId } from 'react';
import { Phone } from 'lucide-react';
import { COUNTRIES, type Country } from '@shared/data/countries';

/**
 * Country selector + national number, styled for the auth card.
 *
 * This keeps the behaviour the existing PhoneInput already had — digits
 * only, capped at the selected country's expected length, and clearing
 * the number when the country changes so a now-invalid value can't sit
 * there looking accepted. The portals serve people outside India too, so
 * the selector stays; hard-coding +91 would have quietly removed working
 * functionality for everyone else.
 */
export default function PhoneField({
  country,
  onCountryChange,
  digits,
  onDigitsChange,
  onSubmit,
  disabled = false,
  label = 'Mobile number',
}: {
  country: Country;
  onCountryChange: (c: Country) => void;
  digits: string;
  onDigitsChange: (d: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();

  function handleCountrySelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = COUNTRIES.find((c) => `${c.iso}-${c.dialCode}` === e.target.value);
    if (selected) {
      onCountryChange(selected);
      onDigitsChange('');
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}
      </label>

      <div className="group flex items-stretch overflow-hidden rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        <div className="relative flex shrink-0 items-center border-r border-border/70 pl-3">
          <Phone
            size={15}
            className="text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple"
          />
          <select
            value={`${country.iso}-${country.dialCode}`}
            onChange={handleCountrySelect}
            disabled={disabled}
            aria-label="Country dialling code"
            className="max-w-[104px] cursor-pointer bg-transparent py-3 pl-2 pr-2 text-sm font-medium text-ink-900 outline-none disabled:cursor-not-allowed"
          >
            {COUNTRIES.map((c) => (
              <option key={`${c.iso}-${c.dialCode}`} value={`${c.iso}-${c.dialCode}`}>
                {c.dialCode} {c.iso}
              </option>
            ))}
          </select>
        </div>

        <input
          id={id}
          value={digits}
          disabled={disabled}
          onChange={(e) => onDigitsChange(e.target.value.replace(/\D/g, '').slice(0, country.digits))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) onSubmit();
          }}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={`${country.digits}-digit number`}
          aria-describedby={`${id}-hint`}
          className="w-full min-w-0 bg-transparent px-3.5 py-3 text-sm tracking-[0.02em] text-ink-900 outline-none placeholder:tracking-normal placeholder:text-ink-300 disabled:cursor-not-allowed"
        />
      </div>

      <p id={`${id}-hint`} className="mt-1.5 text-[11px] text-ink-500">
        We&apos;ll text a 6-digit code to {country.dialCode} {digits || '·'.repeat(country.digits)}
      </p>
    </div>
  );
}
