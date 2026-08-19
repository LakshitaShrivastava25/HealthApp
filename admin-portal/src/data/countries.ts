export type Country = {
  name: string;
  iso: string;
  dialCode: string;
  digits: number;
};

// Dial code + expected national number length for common countries.
// "digits" is the typical/most common length used to validate input and
// cap the field — a handful of countries genuinely allow more than one
// valid length in real life, but a single practical default keeps the
// input predictable rather than silently accepting anything.
export const COUNTRIES: Country[] = [
  { name: 'India', iso: 'IN', dialCode: '+91', digits: 10 },
  { name: 'United States', iso: 'US', dialCode: '+1', digits: 10 },
  { name: 'United Kingdom', iso: 'GB', dialCode: '+44', digits: 10 },
  { name: 'Canada', iso: 'CA', dialCode: '+1', digits: 10 },
  { name: 'Australia', iso: 'AU', dialCode: '+61', digits: 9 },
  { name: 'United Arab Emirates', iso: 'AE', dialCode: '+971', digits: 9 },
  { name: 'Saudi Arabia', iso: 'SA', dialCode: '+966', digits: 9 },
  { name: 'Singapore', iso: 'SG', dialCode: '+65', digits: 8 },
  { name: 'Germany', iso: 'DE', dialCode: '+49', digits: 10 },
  { name: 'France', iso: 'FR', dialCode: '+33', digits: 9 },
  { name: 'Italy', iso: 'IT', dialCode: '+39', digits: 10 },
  { name: 'Spain', iso: 'ES', dialCode: '+34', digits: 9 },
  { name: 'Netherlands', iso: 'NL', dialCode: '+31', digits: 9 },
  { name: 'Switzerland', iso: 'CH', dialCode: '+41', digits: 9 },
  { name: 'Sweden', iso: 'SE', dialCode: '+46', digits: 9 },
  { name: 'Ireland', iso: 'IE', dialCode: '+353', digits: 9 },
  { name: 'Portugal', iso: 'PT', dialCode: '+351', digits: 9 },
  { name: 'Russia', iso: 'RU', dialCode: '+7', digits: 10 },
  { name: 'China', iso: 'CN', dialCode: '+86', digits: 11 },
  { name: 'Japan', iso: 'JP', dialCode: '+81', digits: 10 },
  { name: 'South Korea', iso: 'KR', dialCode: '+82', digits: 10 },
  { name: 'Hong Kong', iso: 'HK', dialCode: '+852', digits: 8 },
  { name: 'Taiwan', iso: 'TW', dialCode: '+886', digits: 9 },
  { name: 'Indonesia', iso: 'ID', dialCode: '+62', digits: 10 },
  { name: 'Malaysia', iso: 'MY', dialCode: '+60', digits: 9 },
  { name: 'Thailand', iso: 'TH', dialCode: '+66', digits: 9 },
  { name: 'Vietnam', iso: 'VN', dialCode: '+84', digits: 9 },
  { name: 'Philippines', iso: 'PH', dialCode: '+63', digits: 10 },
  { name: 'Pakistan', iso: 'PK', dialCode: '+92', digits: 10 },
  { name: 'Bangladesh', iso: 'BD', dialCode: '+880', digits: 10 },
  { name: 'Sri Lanka', iso: 'LK', dialCode: '+94', digits: 9 },
  { name: 'Nepal', iso: 'NP', dialCode: '+977', digits: 10 },
  { name: 'Israel', iso: 'IL', dialCode: '+972', digits: 9 },
  { name: 'Turkey', iso: 'TR', dialCode: '+90', digits: 10 },
  { name: 'Egypt', iso: 'EG', dialCode: '+20', digits: 10 },
  { name: 'South Africa', iso: 'ZA', dialCode: '+27', digits: 9 },
  { name: 'Nigeria', iso: 'NG', dialCode: '+234', digits: 10 },
  { name: 'Kenya', iso: 'KE', dialCode: '+254', digits: 9 },
  { name: 'Brazil', iso: 'BR', dialCode: '+55', digits: 11 },
  { name: 'Mexico', iso: 'MX', dialCode: '+52', digits: 10 },
  { name: 'Argentina', iso: 'AR', dialCode: '+54', digits: 10 },
  { name: 'New Zealand', iso: 'NZ', dialCode: '+64', digits: 9 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India — matches the seeded demo accounts
