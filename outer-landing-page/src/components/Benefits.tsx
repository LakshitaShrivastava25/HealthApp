import Reveal from './Reveal'
import { BellIcon, ClockIcon, EmergencyQRIcon, InsuranceIcon } from './icons'

const benefits = [
  {
    icon: ClockIcon,
    title: 'Save Time',
    description: 'No more digging through paper files or old prescriptions — everything lives in one place.',
  },
  {
    icon: BellIcon,
    title: 'Never Miss a Dose',
    description: 'Smart reminders keep the whole family on track, so medicines are never forgotten.',
  },
  {
    icon: EmergencyQRIcon,
    title: 'Peace of Mind in Emergencies',
    description: 'Critical health info is accessible in seconds, right when first responders need it via QR.',
  },
  {
    icon: InsuranceIcon,
    title: 'Smarter Insurance Decisions',
    description: 'AI explains your policy in plain language and estimates claims before you file.',
  },
]

export default function Benefits() {
  return (
    <section id="benefits" className="relative scroll-mt-20 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Why Families Choose HealthNow
          </h2>
          <p className="mt-4 text-lg text-body">
            Less admin, fewer surprises — healthcare that works quietly in the background of your life.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {benefits.map((benefit, i) => (
            <Reveal key={benefit.title} delay={(i % 2) * 0.1}>
              <div className="flex h-full items-start gap-5 rounded-3xl border border-slate-100 bg-white/80 p-7 shadow-sm shadow-slate-200/50 backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-light text-accent-dark">
                  <benefit.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink">{benefit.title}</h3>
                  <p className="mt-2 text-body">{benefit.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
