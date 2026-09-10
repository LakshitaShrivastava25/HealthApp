import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from './tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * One step of an auth flow, animated in and out.
 *
 * Meant to be used inside <AnimatePresence mode="wait">, with the step
 * name as the key: the outgoing step finishes leaving before the incoming
 * one arrives, so the two never overlap and the card's `layout` animation
 * has a single height to resolve to.
 *
 * Under reduced motion this becomes a plain crossfade — the step still
 * changes visibly, it just doesn't travel.
 */
export default function Step({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -14 }}
      transition={{ duration: 0.26, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The heading pair at the top of a step. Kept here so all three portals
 * word and space these identically.
 */
export function StepHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink-900">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{subtitle}</p>}
    </div>
  );
}
