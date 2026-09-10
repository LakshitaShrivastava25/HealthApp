import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { CloseIcon, HeartPulseIcon, MenuIcon } from './icons'
import { MAIN_APP_URL } from '../config'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Benefits', href: '#benefits' },
  { label: 'Security', href: '#security' },
  { label: 'About Us', href: '#about-us' },
  { label: 'Contact', href: '#contact' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#hero" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <HeartPulseIcon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          HealthNow
        </a>

        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-body transition hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={MAIN_APP_URL}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand"
          >
            Use Web App
          </a>
          <a
            href="#"
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand/20 transition hover:bg-brand-dark"
          >
            Get the App
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink lg:hidden"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-slate-100 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 text-sm font-medium text-body transition hover:bg-brand-light/50 hover:text-brand"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-3">
                <a
                  href={MAIN_APP_URL}
                  className="w-full rounded-full border border-slate-200 px-5 py-2.5 text-center text-sm font-semibold text-ink"
                >
                  Use Web App
                </a>
                <a
                  href="#"
                  className="w-full rounded-full bg-brand px-5 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-brand/20"
                >
                  Get the App
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
