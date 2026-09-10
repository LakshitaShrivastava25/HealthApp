import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';

/**
 * Framer's hook returns `boolean | null` (null until the media query has
 * been read). Every caller here wants a plain boolean and should treat
 * "not known yet" as "motion is fine", so this narrows it once instead of
 * making each component handle the null.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() === true;
}
