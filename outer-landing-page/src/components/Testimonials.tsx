import Reveal from './Reveal'
import { StarIcon } from './icons'

const testimonials = [
  {
    quote:
      "Managing my parents' medicines used to mean three different diaries and constant phone calls. Now everything's in one app with reminders that actually work. It's given me real peace of mind.",
    name: 'Rohan K.',
    role: 'Caregiver for parents',
    initial: 'R',
    color: 'bg-brand',
  },
  {
    quote:
      "Tracking my kids' vaccination records was a nightmare before HealthNow. Now I get a gentle reminder before every dose is due, and our pediatrician can see the full history instantly.",
    name: 'Priya S.',
    role: 'Mother of two',
    initial: 'P',
    color: 'bg-accent-dark',
  },
  {
    quote:
      "I never understood what my insurance actually covered until HealthNow's AI broke it down in plain language. It even estimated my claim amount before I filed — spot on.",
    name: 'Anjali M.',
    role: 'Policyholder',
    initial: 'A',
    color: 'bg-sky-500',
  },
  {
    quote:
      'My father collapsed at a family gathering and the paramedics scanned his Emergency QR card — his allergies and conditions came up instantly. That one feature might have saved his life.',
    name: 'Vikram T.',
    role: 'Son & emergency contact',
    initial: 'V',
    color: 'bg-teal-500',
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative scroll-mt-20 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Loved by Families Across India
          </h2>
          <p className="mt-4 text-lg text-body">
            Real stories from families who brought their healthcare into one calm place.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {testimonials.map((testimonial, i) => (
            <Reveal key={testimonial.name} delay={(i % 2) * 0.1}>
              <div className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white/80 p-7 shadow-sm shadow-slate-200/50 backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/10">
                <div className="flex items-center gap-1 text-amber-400">
                  {Array.from({ length: 5 }, (_, starIndex) => (
                    <StarIcon key={starIndex} className="h-4 w-4" />
                  ))}
                </div>
                <p className="mt-4 flex-1 text-body">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${testimonial.color}`}
                  >
                    {testimonial.initial}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{testimonial.name}</p>
                    <p className="text-xs text-body">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
