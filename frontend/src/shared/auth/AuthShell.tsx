import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import AnimatedMedicalBackground from './AnimatedMedicalBackground';
import AuthKeyframes from './AuthKeyframes';
import { EASE_OUT } from './tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * The page frame every auth screen sits in: animated background, centred
 * column, and the one place the shared keyframes get injected.
 *
 * The entrance is staged the way the brief asks for — background first,
 * then the card lifting in behind it — by giving the background a plain
 * fade and the card a delayed transform. Two animations, no orchestration
 * machinery.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10 sm:px-6">
      <AuthKeyframes />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
        <AnimatedMedicalBackground />
      </motion.div>

      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.18, ease: EASE_OUT }}
        className="relative z-10 w-full max-w-[420px]"
      >
        {/* Float lives on an inner element so it composes with the entrance
            transform above instead of fighting it for the same property. */}
        <div className="hn-card-float" style={{ willChange: 'transform' }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
