import Reveal from './Reveal'
import DashboardMockup from './DashboardMockup'
import PhoneMockup from './PhoneMockup'
import FloatingFeatureBadges from './FloatingFeatureBadges'
import { ArrowRightIcon, LockIcon, ShieldCheckIcon, SmartphoneIcon, SparkleIcon, UsersIcon } from './icons'
import { MAIN_APP_URL } from '../config'

const trustIndicators = [
  {
    icon: ShieldCheckIcon,
    label: 'HIPAA Compliant',
    sub: 'Your data is 100% safe',
  },
  {
    icon: LockIcon,
    label: 'End-to-End Encryption',
    sub: 'Privacy is our priority',
  },
  {
    icon: UsersIcon,
    label: 'Trusted by 10,000+',
    sub: 'Families across India',
  },
]

export default function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 xl:grid-cols-2 xl:gap-12">
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
              <span className="block">
                <span className="text-ink">Your </span>
                <span className="text-brand">Health.</span>
              </span>
              <span className="block text-brand">Organized.</span>
              <span className="block">
                <span className="text-brand">Intelligently</span>
                <span className="text-ink"> Yours.</span>
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mx-auto mt-6 max-w-xl text-lg text-body xl:mx-0">
              Store medical records, understand insurance, track medicines, and connect with doctors —
              all in one secure platform.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row xl:items-start xl:justify-start">
              <a
                href={MAIN_APP_URL}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark hover:shadow-xl sm:w-auto"
              >
                Use Web App
                <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" strokeWidth={2.2} />
              </a>
              <a
                href="#"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-ink transition hover:border-brand/40 hover:text-brand sm:w-auto"
              >
                <SmartphoneIcon className="h-4 w-4" strokeWidth={2} />
                Get the App
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.4}>
            <div className="mx-auto mt-12 grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-3 xl:mx-0 xl:max-w-none">
              {trustIndicators.map((item) => (
                <div key={item.label} className="flex items-center gap-3 xl:items-start">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light/70 text-brand">
                    <item.icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-ink">{item.label}</p>
                    <p className="text-[11px] text-body">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* right column — dashboard + phone mockup centerpiece */}
        <Reveal delay={0.2} className="relative">
          {/* full composition: desktop+ only */}
          <div className="relative mx-auto hidden w-full max-w-[560px] xl:block">
            <div className="pl-16 pt-8 pb-12 pr-4">
              <DashboardMockup />
            </div>
            <PhoneMockup tilted className="absolute top-[49%] left-[82%] z-20" />
            <FloatingFeatureBadges />
          </div>

          {/* simplified composition: below desktop */}
          <div className="flex justify-center xl:hidden">
            <PhoneMockup className="shadow-2xl" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
