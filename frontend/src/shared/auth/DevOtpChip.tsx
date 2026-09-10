import { motion } from 'framer-motion';
import { SquareTerminal } from 'lucide-react';

/**
 * The development-only code hint.
 *
 * SMS delivery is not wired up yet — accounts/services.py prints the code
 * to the server console and returns it in the response only when Django
 * runs with DEBUG=True. Without this chip, signing in locally means
 * alt-tabbing to the backend terminal to read a six-digit number, so it
 * earns its place; it simply cannot appear in production, because the
 * field it renders is absent from the response there.
 *
 * Clicking it fills the boxes, which is the whole point of having it.
 */
export default function DevOtpChip({ code, onUse }: { code: string; onUse: (code: string) => void }) {
  return (
    <motion.button
      type="button"
      onClick={() => onUse(code)}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-brand-purple/35 bg-brand-lavender/70 px-3 py-2.5 text-left transition-colors hover:bg-brand-lavender focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40"
    >
      <SquareTerminal size={14} className="shrink-0 text-brand-purple" />
      <span className="text-[11px] text-ink-700">
        Dev mode — your code is <span className="font-semibold tracking-wider text-brand-purple">{code}</span>
      </span>
      <span className="ml-auto shrink-0 text-[11px] font-semibold text-brand-purple">Fill</span>
    </motion.button>
  );
}
