import { useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from '../data/countries';

export function usePhoneInput() {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState('');

  const isComplete = digits.length === country.digits;
  const fullNumber = `${country.dialCode}${digits}`;

  function reset() {
    setDigits('');
  }

  return { country, setCountry, digits, setDigits, isComplete, fullNumber, reset };
}

export default function PhoneInput({
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
  function handleCountrySelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = COUNTRIES.find((c) => `${c.iso}-${c.dialCode}` === e.target.value);
    if (selected) {
      onCountryChange(selected);
      onDigitsChange(''); // digit count requirement changed — start clean rather than leaving a now-invalid value
    }
  }

  function handleDigitsInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Digits only, capped at what the selected country actually expects.
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, country.digits);
    onDigitsChange(cleaned);
  }

  return (
    <div className="flex gap-2">
      <select
        value={`${country.iso}-${country.dialCode}`}
        onChange={handleCountrySelect}
        className="text-sm px-2.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 bg-white shrink-0 max-w-[132px]"
      >
        {COUNTRIES.map((c) => (
          <option key={`${c.iso}-${c.dialCode}`} value={`${c.iso}-${c.dialCode}`}>
            {c.dialCode} {c.name}
          </option>
        ))}
      </select>
      <input
        value={digits}
        onChange={handleDigitsInput}
        inputMode="numeric"
        placeholder={`${country.digits}-digit number`}
        className="flex-1 text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 min-w-0"
      />
    </div>
  );
}
