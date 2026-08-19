/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
