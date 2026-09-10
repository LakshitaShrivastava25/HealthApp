import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert } from 'lucide-react';

/**
 * The error line, announced to assistive tech.
 *
 * role="alert" matters more than it looks here: several of these messages
 * are the only signal that something changed — "that code has expired",
 * "2 attempts left" — and a screen-reader user who doesn't hear them has
 * no way to know why the form isn't working.
 *
 * Height is animated so the card grows into the message rather than
 * jumping, which is also why it renders inside the card's layout scope.
 */
export default function FormError({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-bg px-3 py-2.5"
          >
            <CircleAlert size={14} className="mt-px shrink-0 text-danger" />
            <p className="text-[12px] leading-relaxed text-danger">{message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
