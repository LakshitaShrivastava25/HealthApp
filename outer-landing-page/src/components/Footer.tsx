import Reveal from './Reveal'
import { MAIN_APP_URL } from '../config'

export default function Footer() {
  return (
    <footer className="relative border-t border-slate-100 bg-white/70 px-6 py-16">
      <Reveal className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2 text-xl font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            +
          </span>
          HealthNow
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
        <p className="mt-4 text-sm text-slate-400">HealthNow. All rights reserved.</p>
      </Reveal>
    </footer>
  )
}
