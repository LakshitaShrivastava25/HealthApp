import Reveal from './Reveal'
import { KeyIcon, LockIcon, ShieldCheckIcon } from './icons'

// Keep these claims literal: uploads are read server-side for AI/OCR (so this is not end-to-end
// encryption), and there is no HIPAA certification. Say only what the platform actually does.
const points = [
  {
    icon: ShieldCheckIcon,
    title: 'Private by Default',
    description: 'Your files are stored privately and opened only through short-lived, signed links.',
  },
  {
    icon: LockIcon,
    title: 'Encrypted in Transit',
    description: 'Every connection between your device and CuraPath uses HTTPS.',
  },
  {
    icon: KeyIcon,
    title: 'You Control Who Sees Your Data',
    description: 'Grant and revoke access for family members and doctors whenever you choose.',
  },
]

export default function Security() {
  return (
    <section id="security" className="relative scroll-mt-20 overflow-hidden bg-lp-ink px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Your Health Data, Protected
          </h2>
          <p className="mt-4 text-lg text-slate-300">Built so your family&apos;s records stay yours.</p>
        </Reveal>

        <div className="mx-auto mt-16 grid max-w-xl grid-cols-1 gap-6 md:max-w-none md:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point.title} delay={i * 0.1}>
              <div className="h-full rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur transition hover:-translate-y-1 hover:border-white/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lp-brand/20 text-lp-brand-light">
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
