import { motion } from 'framer-motion';
import { HeartPulse, ShieldCheck, Stethoscope } from 'lucide-react';
import { EASE_OUT } from './tokens';

export type Portal = 'patient' | 'doctor' | 'admin';

/**
 * The HealthNow brand lockup for the auth screens.
 *
 * The mark itself is unchanged from what Sidebar.tsx and the old login
 * already shipped — a solid brand-teal rounded square holding a lucide
 * icon, beside one bold "HealthNow" wordmark. That matters more than it
 * looks: a person signs in and lands on the dashboard a second later, and
 * a logo that shifts between those two frames reads as two products.
 *
 * The only additions are scale (this is a hero, not a 36px sidebar chip)
 * and a soft teal bloom behind the badge so it sits in the animated scene
 * rather than on top of it. Colour, icon and wordmark are untouched.
 */

const MARKS = {
  patient: { Icon: HeartPulse, label: 'HealthNow', sub: 'Your Health, Our Priority' },
  doctor: { Icon: Stethoscope, label: 'HealthNow', sub: 'Doctor Portal' },
  admin: { Icon: ShieldCheck, label: 'HealthNow', sub: 'Admin Portal' },
} as const;

export default function HealthNowLogo({
  portal = 'patient',
  showTagline = true,
}: {
  portal?: Portal;
  showTagline?: boolean;
}) {
  const { Icon, label, sub } = MARKS[portal];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="flex flex-col items-center"
    >
      <div className="flex items-center gap-2.5">
        <div className="relative">
          {/* Bloom. Sits behind the badge, never animates a shadow. */}
          <div className="absolute inset-0 rounded-xl bg-brand-teal/35 blur-lg" aria-hidden="true" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal text-white shadow-[0_6px_16px_-4px_rgba(14,165,166,0.55)]">
            <Icon size={22} strokeWidth={2.5} />
          </div>
        </div>
        <p className="text-[22px] font-bold leading-none tracking-[-0.01em] text-ink-900">{label}</p>
      </div>

      {showTagline && <p className="mt-2.5 text-xs font-medium text-ink-500">{sub}</p>}
    </motion.div>
  );
}
