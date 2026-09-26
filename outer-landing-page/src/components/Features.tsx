import Reveal from './Reveal'
import {
  AIAssistantIcon,
  EmergencyQRIcon,
  FamilyRecordsIcon,
  InsuranceIcon,
  MedicineIcon,
  VerifiedDoctorIcon,
} from './icons'

const features = [
  {
    icon: FamilyRecordsIcon,
    title: 'Family Medical Records',
    description:
      "A unified health history for every family member, organized and accessible whenever you need it.",
  },
  {
    icon: AIAssistantIcon,
    title: 'AI Health Assistant',
    description: 'Ask health questions in plain language and get instant, guided answers you can trust.',
  },
  {
    icon: InsuranceIcon,
    title: 'Insurance Management',
    description: 'Upload policies and let AI estimate claims, so paperwork never slows down care.',
  },
  {
    icon: MedicineIcon,
    title: 'Medicine Tracker',
    description: 'Gentle reminders and one-tap mark-as-taken keep every prescription on schedule.',
  },
  {
    icon: EmergencyQRIcon,
    title: 'Emergency QR Card',
    description: 'Critical health info available in seconds, right when first responders need it most.',
  },
  {
    icon: VerifiedDoctorIcon,
    title: 'Find Verified Doctors',
    description: 'Search and connect with verified care providers near you, matched to your needs.',
  },
]

export default function Features() {
  return (
    <section id="features" className="relative scroll-mt-20 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Everything your family&apos;s health needs, in one app
          </h2>
          <p className="mt-4 text-lg text-body">
            Six tools built around real family life — not another dashboard to manage.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 0.08}>
              <div className="group h-full rounded-3xl border border-slate-100 bg-white/80 p-7 shadow-sm shadow-slate-200/50 backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand transition group-hover:bg-brand group-hover:text-white">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-body">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
