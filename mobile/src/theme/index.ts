/**
 * The CurePath palette, ported from the web app's tailwind.config.js.
 *
 * Same values, so the two clients read as one product. Kept as plain
 * objects rather than utility classes because React Native styles are
 * objects — there is no Tailwind layer here on purpose: one less build
 * step to misconfigure, and native components want real numbers for
 * spacing and radii anyway.
 */

export const colors = {
  brandTeal: '#0EA5A6',
  brandPurple: '#6D5BD0',
  brandPurpleDark: '#5B4BC4',
  brandLavender: '#F1EEFC',

  surface: '#F6F7FB',
  card: '#FFFFFF',
  border: '#E7E9F1',

  ink900: '#1F2430',
  ink700: '#3F4557',
  ink500: '#6B7280',
  ink300: '#9CA3AF',

  success: '#10B981',
  successBg: '#E7F8F1',
  warning: '#F59E0B',
  warningBg: '#FEF3E2',
  danger: '#EF4444',
  dangerBg: '#FDEBEB',
  info: '#3B82F6',
  infoBg: '#EAF1FE',

  white: '#FFFFFF',
} as const;

/** 4pt spacing scale — the rhythm the web cards already use. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const type = {
  h1: { fontSize: 24, fontWeight: '700' as const, color: colors.ink900 },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.ink900 },
  title: { fontSize: 15, fontWeight: '600' as const, color: colors.ink900 },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.ink700 },
  label: { fontSize: 13, fontWeight: '500' as const, color: colors.ink700 },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.ink500 },
  micro: { fontSize: 11, fontWeight: '500' as const, color: colors.ink300 },
} as const;

/** The web app's `shadow-card`, translated for both platforms. */
export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
} as const;

/** Badge tones, matching the web `Badge` component's vocabulary. */
export const tones = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  neutral: { bg: colors.surface, fg: colors.ink500 },
} as const;

export type ToneName = keyof typeof tones;
