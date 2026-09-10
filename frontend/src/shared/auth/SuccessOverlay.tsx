import { motion } from 'framer-motion';
import { EASE_OUT } from './tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * The beat between "verified" and the next screen.
 *
 * Covers the card rather than replacing the page, so nothing behind it
 * shifts. The tick is drawn with pathLength rather than faded in — a
 * stroke that draws itself reads as confirmation, where a fade just reads
 * as another element appearing.
 *
 * Timing is the caller's job: it decides how long this sits before
 * navigating, because how long depends on where the person is going.
 */
export default function SuccessOverlay({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 rounded-[28px] bg-white/95 backdrop-blur-sm"
    >
      <div className="relative mb-3 flex h-[74px] w-[74px] items-center justify-center">
        {/* Ring that expands and fades outward, like a single ripple. */}
        {!reduced && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 0.6, opacity: 0.7 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
          />
        )}

        <motion.div
          initial={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-success-bg"
        >
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
            <motion.path
              d="M8 17.5 L14.5 24 L26 11"
              stroke="#10B981"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3, ease: EASE_OUT }}
        className="text-base font-semibold text-ink-900"
      >
        {title}
      </motion.p>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.38, ease: EASE_OUT }}
          className="text-xs text-ink-500"
        >
          {subtitle}
        </motion.p>
      )}
    </motion.div>
  );
}
