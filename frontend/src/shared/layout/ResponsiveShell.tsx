import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';

/**
 * The app shell: a persistent sidebar on large screens, an off-canvas drawer
 * below that.
 *
 * Breakpoint is `lg` (1024px), not `md`:
 *   - Desktop is defined as 1024px+ and must behave exactly as it does today,
 *     so lg is where the persistent sidebar stays untouched.
 *   - A tablet at 768–1023px keeps the drawer. A 256px sidebar there eats a
 *     third of the width, and these pages are data-dense (admin tables, the
 *     dashboard grids). An icon-only rail was the alternative, but this app's
 *     nav labels genuinely disambiguate — "Doctor Access" vs "Find Care" vs
 *     "Health Timeline" are not guessable from icons alone — so collapsing to
 *     icons would trade horizontal space for navigational uncertainty.
 *
 * Each portal passes its OWN sidebar in. The three are deliberately not
 * merged; only the drawer mechanics are shared, so this logic exists once
 * instead of three times.
 */

type MobileNavValue = { open: boolean; setOpen: (v: boolean) => void };

const MobileNavContext = createContext<MobileNavValue>({ open: false, setOpen: () => {} });

export function useMobileNav() {
  return useContext(MobileNavContext);
}

/**
 * The hamburger. Lives in each portal's Topbar so it sits on the header row
 * next to the page title rather than floating over it.
 */
export function MobileMenuButton({ label = 'Open navigation menu' }: { label?: string }) {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      // 40px square: comfortably above the ~44px tap-target guidance once the
      // surrounding padding is counted, and hidden entirely once the real
      // sidebar is on screen.
      className="lg:hidden -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40"
    >
      <Menu size={20} />
    </button>
  );
}

export default function ResponsiveShell({
  sidebar,
  portal,
}: {
  sidebar: ReactNode;
  /** Selects the accent palette defined in index.css under [data-portal]. */
  portal: 'patient' | 'doctor' | 'admin';
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Navigating from inside the drawer should close it — otherwise the new
  // page loads behind a drawer the person has to dismiss by hand.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Escape closes it, and the page behind must not scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      <div data-portal={portal} className="flex min-h-screen bg-surface">
        {/* Scrim. Below lg only — at lg+ the sidebar is part of the layout and
            there is nothing to dismiss. */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden"
          />
        )}

        {/* Off-canvas below lg, ordinary flex child at lg+. The portal's own
            sidebar renders inside untouched. */}
        <div
          className={`fixed inset-y-0 left-0 z-50 shrink-0 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Close control, drawer-only. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="absolute right-2 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-surface lg:hidden"
          >
            <X size={18} />
          </button>
          {sidebar}
        </div>

        {/* min-w-0 is what stops a wide child (a table, a long unbroken
            string) from forcing the whole page wider than the viewport. */}
        <div className="min-w-0 flex-1">
          {/* Page transition, applied once here rather than per page. Keyed on
              pathname so each route fades in; opacity + a 4px rise only, and
              short enough (180ms) that navigation still feels immediate. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MobileNavContext.Provider>
  );
}
