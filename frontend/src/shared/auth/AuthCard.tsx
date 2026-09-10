import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from './tokens';

/**
 * The glass card the whole auth flow happens inside.
 *
 * Kept at 0.9 alpha rather than the fashionable 0.6: this card carries
 * form labels, error text and a six-digit code, and every point of
 * transparency is contrast spent on decoration. The blur and the light
 * top border do the glass work; the fill stays readable.
 *
 * `layout` is what makes the card grow and shrink smoothly as steps swap
 * in content of different heights, instead of snapping to each new size.
 */
export default function AuthCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.32, ease: EASE_OUT } }}
      className={`relative overflow-hidden rounded-[28px] border border-white/70 bg-white/90 p-7 shadow-[0_28px_70px_-24px_rgba(76,58,158,0.28),0_2px_8px_rgba(16,24,40,0.04)] backdrop-blur-xl sm:p-8 ${className}`}
    >
      {/* A one-pixel light catch across the top edge — the detail that
          reads as glass rather than as a white box with a blur filter. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
      />
      {children}
    </motion.div>
  );
}
