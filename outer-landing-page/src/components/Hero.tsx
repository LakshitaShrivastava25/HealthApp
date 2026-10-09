import Reveal from './Reveal'
import DashboardMockup from './DashboardMockup'
import PhoneMockup from './PhoneMockup'
import FloatingFeatureBadges from './FloatingFeatureBadges'
import VisitWebAppButton from './VisitWebAppButton'
import { LockIcon, ShieldCheckIcon, SparkleIcon, UsersIcon } from './icons'

const trustIndicators = [
  {
    icon: ShieldCheckIcon,
    label: 'Consent-based doctor access',
    sub: 'You approve every request',
  },
  {
    icon: LockIcon,
    label: 'Encrypted in transit',
    sub: 'HTTPS on every connection',
  },
  {
    icon: UsersIcon,
    label: 'Trusted by 10,000+',
    sub: 'Families across India',
  },
]

export default function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden px-6 pt-14 pb-20 sm:pt-20 sm:pb-28 xl:pt-24 xl:pb-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 xl:grid-cols-2 xl:gap-12">
        {/* left column */}
        <div className="text-center xl:text-left">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-light bg-brand-light/60 px-4 py-1.5 text-sm font-medium text-brand-dark">
              <SparkleIcon className="h-4 w-4" strokeWidth={1.8} />
              AI-Powered Health Platform
            </span>
          </Reveal>

          <Reveal delay={0.1}>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-6xl">
              <span className="block">Your Health.</span>
              <span className="block">
                <span className="bg-linear-to-r from-brand to-accent-dark bg-clip-text text-transparent">
                  Organized.
                </span>
              </span>
              <span className="block">Intelligently Yours.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-body sm:text-xl xl:mx-0">
              Store medical records, understand insurance, track medicines, and connect with doctors —
              all in one secure platform.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col items-center gap-3 xl:items-start">
              <VisitWebAppButton size="lg" className="w-full sm:w-auto" />
              <p className="text-sm text-body">Runs in your browser — nothing to install.</p>
            </div>
          </Reveal>

          <Reveal delay={0.4}>
            <ul className="mx-auto mt-10 grid w-fit grid-cols-1 gap-x-6 gap-y-4 border-t border-slate-200/70 pt-8 text-left sm:w-auto sm:grid-cols-3 xl:mx-0">
              {trustIndicators.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light/70 text-brand">
                    <item.icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="mt-0.5 text-xs text-body">{item.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* right column: product mockups (decorative, so hidden from assistive tech) */}
        <Reveal delay={0.2} className="relative">
          <div aria-hidden="true">
            {/* full composition: tablet and up */}
            <div className="relative mx-auto hidden w-full max-w-[560px] md:block">
              <div className="pl-16 pt-8 pb-12 pr-4">
                <DashboardMockup />
              </div>
              <PhoneMockup tilted className="absolute top-[49%] left-[82%] z-20" />
              <FloatingFeatureBadges />
            </div>

            {/* simplified composition: phones */}
            <div className="flex justify-center md:hidden">
              <PhoneMockup className="shadow-2xl" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
