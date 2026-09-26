import Reveal from './Reveal'
import { MailIcon } from './icons'

const stats = [
  { value: '10,000+', label: 'Families' },
  { value: '50,000+', label: 'Medical Records Digitized' },
  { value: '99.9%', label: 'Uptime' },
  { value: '24/7', label: 'AI Assistant Availability' },
]

export default function AboutUs() {
  return (
    <section id="about-us" className="relative scroll-mt-20 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">About HealthNow</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-body">
            Across India, a typical family manages health records scattered across paper files,
            WhatsApp photos of prescriptions, and insurance PDFs buried in email — with no single place
            that ties it all together for parents, kids, and aging grandparents alike.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-body">
            We built HealthNow to change that. Our mission is to bring every record, reminder, and
            decision into one calm, AI-guided place — so families spend less time hunting for
            information and more time on what actually matters: each other.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 sm:gap-8">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <p className="text-3xl font-bold text-brand sm:text-4xl">{stat.value}</p>
              <p className="mt-1.5 text-sm text-body">{stat.label}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15} className="mt-16">
          <div
            id="contact"
            className="mx-auto max-w-md scroll-mt-24 rounded-3xl border border-slate-100 bg-white/80 p-8 shadow-sm shadow-slate-200/50 backdrop-blur-sm"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
              <MailIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-ink">Get in Touch</h3>
            <p className="mt-2 text-body">
              Questions, feedback, or partnership ideas — we&apos;d love to hear from you.
            </p>
            <a
              href="mailto:hello@healthnow.in"
              className="mt-4 inline-block font-semibold text-brand transition hover:text-brand-dark"
            >
              hello@healthnow.in
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
