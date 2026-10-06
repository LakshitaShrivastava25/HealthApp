import Reveal from './Reveal'
import BrandMark from './BrandMark'
import { DELETE_ACCOUNT_URL, MAIN_APP_URL, PRIVACY_URL, TERMS_URL } from '../config'

const LEGAL_LINKS = [
  { href: PRIVACY_URL, label: 'Privacy Policy' },
  { href: TERMS_URL, label: 'Terms of Use' },
  { href: DELETE_ACCOUNT_URL, label: 'Delete Account' },
]

export default function Footer() {
  return (
    <footer className="relative border-t border-slate-100 bg-white/70 px-6 py-16">
      <Reveal className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2 text-xl font-semibold text-ink">
          <BrandMark size={32} />
          CuraPath
        </div>
        <p className="max-w-md text-body">
          Ready to bring your family&apos;s healthcare into one calm place?
        </p>
        <a
          href={MAIN_APP_URL}
          className="rounded-full bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark hover:shadow-xl"
        >
          Use App
        </a>
        <nav className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          {LEGAL_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="text-slate-500 transition hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <p className="text-sm text-slate-400">CuraPath. All rights reserved.</p>
      </Reveal>
    </footer>
  )
}
