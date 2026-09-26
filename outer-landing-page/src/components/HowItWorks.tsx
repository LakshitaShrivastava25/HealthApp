import Reveal from './Reveal'
import { ArrowLongRightIcon, CpuIcon, PersonPlusIcon, TrendingUpIcon, UploadIcon } from './icons'

const steps = [
  {
    icon: PersonPlusIcon,
    title: 'Create Profile',
    description: 'Add your and your family members.',
  },
  {
    icon: UploadIcon,
    title: 'Upload & Store',
    description: 'Upload medical documents, prescriptions & insurance.',
  },
  {
    icon: CpuIcon,
    title: 'AI Organizes',
    description: 'Our AI reads and organizes your health data.',
  },
  {
    icon: TrendingUpIcon,
    title: 'Understand & Manage',
    description: 'Get insights, track health and stay informed.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How It Works</h2>
          <p className="mt-4 text-lg text-body">
            Four simple steps to bring your family&apos;s healthcare into one calm place.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="flex items-center gap-4 lg:relative lg:flex-col lg:gap-0 lg:text-center"
            >
              <Reveal delay={i * 0.1} className="shrink-0 lg:shrink">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light text-brand shadow-sm">
                  <step.icon className="h-7 w-7" strokeWidth={1.7} />
                </div>
              </Reveal>

              <Reveal delay={i * 0.1 + 0.05} className="lg:mt-5">
                <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-body">{step.description}</p>
              </Reveal>

              {i < steps.length - 1 && (
                <ArrowLongRightIcon className="hidden h-5 w-5 shrink-0 text-brand/30 lg:absolute lg:right-[-2.2rem] lg:top-8 lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
