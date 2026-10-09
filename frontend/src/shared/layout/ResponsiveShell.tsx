import { createContext, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigationType, useOutlet } from 'react-router-dom';
import { useBackToClose } from '../hooks/useBackToClose';
import { prefetchPages } from '../lazyPage';
import PageFallback from '../components/PageFallback';

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
  const navigationType = useNavigationType();
  const outlet = useOutlet();

  // Navigating from inside the drawer should close it — otherwise the new
  // page loads behind a drawer the person has to dismiss by hand.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // A new page starts at the top; Back/Forward (POP) keeps the browser's
  // own scroll restoration.
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [location.pathname, navigationType]);

  // On a phone, Back closes the open drawer instead of leaving the page.
  useBackToClose(open, () => setOpen(false));

  // With the first page on screen, fetch this portal's other pages in the
  // background so moving between them is instant.
  useEffect(() => {
    prefetchPages(portal);
  }, [portal]);

  const navValue = useMemo(() => ({ open, setOpen }), [open]);

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
    <MobileNavContext.Provider value={navValue}>
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
          {/* Page transition, applied once here rather than per page: a
              short fade-in only. The outlet element is captured per
              pathname — rendering a live <Outlet/> inside AnimatePresence
              made the NEW page mount inside the leaving wrapper too, so
              every navigation mounted (and fetched) each page twice and it
              visibly appeared, vanished and reappeared. No exit animation
              and no "wait": the new page shows immediately. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MobileNavContext.Provider>
  );
}
