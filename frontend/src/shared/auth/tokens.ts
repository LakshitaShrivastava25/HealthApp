/**
 * The HealthNow palette, as plain values.
 *
 * These are the exact same colours the three portals' tailwind.config.js
 * files define — duplicated here only because SVG gradients, canvas-style
 * shadows and inline keyframes need real strings, not class names. If a
 * brand colour ever changes, it changes in both places.
 */
export const C = {
  purple: '#6D5BD0',
  purpleDark: '#5B4BC4',
  purpleSoft: '#8E80DE',
  teal: '#0EA5A6',
  tealSoft: '#4CC7C8',
  lavender: '#F1EEFC',
  blue: '#3B82F6',
  ink900: '#1F2430',
  ink700: '#3F4557',
  ink500: '#6B7280',
  border: '#E7E9F1',
  white: '#FFFFFF',
} as const;

/**
 * Shared easing for every entrance in the auth flow. A long, decelerating
 * curve — things arrive and settle rather than snapping into place, which
 * is what separates "premium" from "animated".
 */
// Typed as mutable tuples, not `as const`: Framer's Easing type wants a
// 4-number tuple, and a readonly one is not assignable to it.
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];
