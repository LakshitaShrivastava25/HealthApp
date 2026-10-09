import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon } from './icons'
import BrandMark from './BrandMark'
import VisitWebAppButton from './VisitWebAppButton'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Benefits', href: '#benefits' },
  { label: 'Security', href: '#security' },
  { label: 'About Us', href: '#about-us' },
  { label: 'Contact', href: '#contact' },
]

// Tailwind's `lg` breakpoint: from here the inline nav replaces the mobile menu.
const DESKTOP_QUERY = '(min-width: 64rem)'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // While the mobile menu is open, close it on Escape (and hand focus back to the toggle), on a
  // tap outside the header, or when the window grows into the desktop layout. Otherwise the
  // menu would be hidden there but still "open".
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const desktop = window.matchMedia(DESKTOP_QUERY)
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    desktop.addEventListener('change', onBreakpointChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      desktop.removeEventListener('change', onBreakpointChange)
    }
  }, [open])

  const closeMenu = () => setOpen(false)

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <a href="#hero" onClick={closeMenu} className="flex items-center gap-2 rounded-lg text-lg font-semibold text-lp-ink">
          <BrandMark size={32} />
          CuraPath
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded text-sm font-medium text-lp-body transition hover:text-lp-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:block">
          <VisitWebAppButton />
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-lp-ink transition hover:bg-slate-100 lg:hidden"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu: overlays the page (absolute) instead of pushing it down, so tapping a link
          and closing the menu can't shift the layout under the in-progress anchor scroll. */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 top-full border-b border-slate-100 bg-white shadow-lg shadow-slate-900/5 lg:hidden"
          >
            <nav
              aria-label="Primary"
              className="mx-auto flex max-h-[calc(100dvh_-_5rem)] max-w-6xl flex-col gap-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-6"
            >
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="rounded-lg px-3 py-3 text-base font-medium text-lp-ink transition hover:bg-lp-brand-light/50 hover:text-lp-brand"
                >
                  {link.label}
                </a>
              ))}
              <VisitWebAppButton size="lg" className="mt-3 w-full" onClick={closeMenu} />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
