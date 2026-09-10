import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';

export type ButtonState = 'idle' | 'loading' | 'done';

/**
 * The main call to action, with its three states built in.
 *
 * The label swaps through AnimatePresence rather than a plain ternary so
 * "Verify & Login" → "Verifying…" → "Login successful" crossfades in
 * place. The button's own width is held by the widest state, so the card
 * never twitches as the label changes.
 *
 * Hover lifts by 1px and deepens the shadow; that is the whole effect.
 * Anything more on a primary action starts to feel like a game button.
 */
export default function PrimaryButton({
  children,
  state = 'idle',
  loadingLabel = 'Please wait…',
  doneLabel = 'Done',
  disabled = false,
  onClick,
  type = 'button',
  withArrow = true,
}: {
  children: ReactNode;
  state?: ButtonState;
  loadingLabel?: string;
  doneLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  withArrow?: boolean;
}) {
  const busy = state !== 'idle';

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={state === 'loading'}
      whileHover={disabled || busy ? undefined : { y: -1 }}
      whileTap={disabled || busy ? undefined : { y: 0, scale: 0.99 }}
      transition={{ duration: 0.18 }}
      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-brand-purple to-brand-purpleDark text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(109,91,208,0.65)] outline-none transition-shadow duration-200 hover:shadow-[0_16px_32px_-10px_rgba(109,91,208,0.75)] focus-visible:ring-2 focus-visible:ring-brand-purple/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
    >
      {/* Sheen that sweeps across on hover. Transform only, and clipped by
          the button's own overflow. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[300%]"
      />

      <AnimatePresence mode="wait" initial={false}>
        {state === 'idle' && (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="relative flex items-center gap-2"
          >
            {children}
            {withArrow && (
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            )}
          </motion.span>
        )}

        {state === 'loading' && (
          <motion.span
            key="loading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="relative flex items-center gap-2"
          >
            <span className="hn-spin h-4 w-4 rounded-full border-2 border-white/35 border-t-white" />
            {loadingLabel}
          </motion.span>
        )}

        {state === 'done' && (
          <motion.span
            key="done"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="relative flex items-center gap-2"
          >
            <Check size={16} strokeWidth={3} />
            {doneLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
