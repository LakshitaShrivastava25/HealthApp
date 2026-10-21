import Reveal from './Reveal'
import BrandMark from './BrandMark'
import VisitWebAppButton from './VisitWebAppButton'
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL } from '../config'

const LEGAL_LINKS = [
  { href: PRIVACY_URL, label: 'Privacy Policy' },
  { href: TERMS_URL, label: 'Terms of Use' },
  { href: DELETE_ACCOUNT_URL, label: 'Delete Account' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    // The extra bottom padding (plus the iOS safe-area inset) keeps the last lines clear of the
    // floating "Get the App" button once the page is scrolled to the end. From lg up the centred
    // content no longer reaches the bottom-right corner, so normal padding is enough.
    <footer className="relative border-t border-slate-100 bg-white/70 px-6 pt-16 pb-[calc(7rem_+_env(safe-area-inset-bottom))] lg:pb-[calc(4rem_+_env(safe-area-inset-bottom))]">
      <Reveal className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2 text-xl font-semibold text-ink">
          <BrandMark size={32} />
          CuraPath
        </div>
        <p className="max-w-md text-body">
          Ready to bring your family&apos;s healthcare into one calm place?
        </p>
        <VisitWebAppButton size="lg" />
        <nav aria-label="Legal" className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
          {LEGAL_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="rounded py-1.5 text-slate-500 transition hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <p className="text-sm text-slate-500">&copy; {year} CuraPath. All rights reserved.</p>
      </Reveal>
    </footer>
  )
}
