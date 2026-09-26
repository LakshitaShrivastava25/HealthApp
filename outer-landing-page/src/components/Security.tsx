import Reveal from './Reveal'
import { KeyIcon, LockIcon, ShieldCheckIcon } from './icons'

const points = [
  {
    icon: ShieldCheckIcon,
    title: 'HIPAA-Compliant Infrastructure',
    description: 'Built on infrastructure designed to meet strict healthcare data-handling standards.',
  },
  {
    icon: LockIcon,
    title: 'End-to-End Encryption',
    description: 'Your records are encrypted in transit and at rest, so only you can read them.',
  },
  {
    icon: KeyIcon,
    title: 'You Control Who Sees Your Data',
    description: 'Grant and revoke access for family members and doctors whenever you choose.',
  },
]

export default function Security() {
  return (
    <section id="security" className="relative scroll-mt-20 overflow-hidden bg-ink px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Your Health Data, Protected
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Every record is guarded with the same rigor a hospital would demand of its own systems.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point.title} delay={i * 0.1}>
              <div className="h-full rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm transition hover:-translate-y-1 hover:border-white/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/20 text-brand-light">
                  <point.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{point.title}</h3>
                <p className="mt-2 text-slate-300">{point.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
