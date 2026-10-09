import { motion, useReducedMotion } from 'framer-motion'
import { GooglePlayIcon } from './icons'
import { PLAY_STORE_URL } from '../config'

/**
 * Floating "Get the App" pill, pinned to the bottom-right corner of the viewport on every
 * section and screen size. It's rendered once from App.
 *
 * - The offsets add the iOS safe-area insets (index.html sets viewport-fit=cover) so the pill
 *   stays clear of the home indicator and rounded corners.
 * - z-40 keeps it under the sticky navbar (z-50) and its mobile menu.
 * - Below 360px it collapses to a round icon button. The aria-label always names it.
 * - The Footer has extra bottom padding so the pill never permanently covers the last line.
 */
export default function GetAppButton() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="fixed right-[calc(1.25rem_+_env(safe-area-inset-right))] bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))] z-40 sm:right-[calc(1.75rem_+_env(safe-area-inset-right))] sm:bottom-[calc(1.75rem_+_env(safe-area-inset-bottom))] print:hidden"
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get the App on Google Play (opens in a new tab)"
        className="flex h-12 min-w-[3rem] items-center justify-center gap-2 rounded-full bg-lp-ink text-white shadow-lg shadow-lp-ink/30 ring-1 ring-white/15 transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-lp-ink/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0 xs:pr-5 xs:pl-4"
      >
        <GooglePlayIcon className="h-5 w-5 shrink-0 text-lp-accent" strokeWidth={1.9} />
        <span className="hidden text-sm font-semibold whitespace-nowrap xs:inline">Get the App</span>
      </a>
    </motion.div>
  )
}
