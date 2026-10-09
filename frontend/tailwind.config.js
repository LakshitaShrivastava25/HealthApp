import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // xs (360px) first, so it sorts before the default breakpoints. Used by
    // the landing page's floating "Get the App" button.
    screens: { xs: '22.5rem', ...defaultTheme.screens },
    extend: {
      colors: {
        // Portal accent. Channel triplets (not hex) so Tailwind's
        // `/opacity` modifiers still work — e.g. bg-accent-soft/70.
        // Values are set per portal in index.css via [data-portal].
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-dark': 'rgb(var(--accent-dark) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        brand: {
          teal: '#0EA5A6',
          purple: '#6D5BD0',
          purpleDark: '#5B4BC4',
          lavender: '#F1EEFC',
        },
        surface: '#F6F7FB',
        card: '#FFFFFF',
        ink: {
          900: '#1F2430',
          700: '#3F4557',
          500: '#6B7280',
          300: '#9CA3AF',
        },
        border: '#E7E9F1',
        success: { DEFAULT: '#10B981', bg: '#E7F8F1' },
        warning: { DEFAULT: '#F59E0B', bg: '#FEF3E2' },
        danger: { DEFAULT: '#EF4444', bg: '#FDEBEB' },
        info: { DEFAULT: '#3B82F6', bg: '#EAF1FE' },
        // The public landing page's own palette (src/landing). Namespaced so
        // its marketing blue and green can't collide with the app's brand,
        // accent and ink colours above.
        lp: {
          brand: { DEFAULT: '#2563eb', dark: '#1d4ed8', light: '#dbeafe' },
          accent: { DEFAULT: '#10b981', dark: '#059669', light: '#d1fae5' },
          ink: '#0f172a',
          body: '#475569',
          surface: '#f8fafc',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        // Resting / hover depth for Card. Deliberately soft and low-contrast:
        // a medical record list should read as calm paper, not as buttons.
        lift: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px -2px rgba(16, 24, 40, 0.08)',
        liftHover: '0 2px 4px rgba(16, 24, 40, 0.05), 0 12px 24px -6px rgba(16, 24, 40, 0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
