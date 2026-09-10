import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock3, LogOut, RefreshCw, UserCog } from 'lucide-react';
import { AuthCard, AuthShell, HealthNowLogo, SecurityBadge } from '@shared/auth';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PendingVerification() {
  const { doctor, refreshDoctor, logout } = useAuth();
  const [checking, setChecking] = useState(false);

  async function handleCheck() {
    setChecking(true);
    try {
      await refreshDoctor();
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard className="text-center">
        <div className="mb-6">
          <HealthNowLogo portal="doctor" />
        </div>

        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
          {/* Slow sweep around the clock — the one place a waiting screen
              genuinely benefits from motion, because the alternative is a
              static page that looks like it has stopped working. */}
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-warning/25 border-t-warning"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          />
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-warning-bg text-warning">
            <Clock3 size={24} />
          </div>
        </div>

        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink-900">Verification pending</h1>
        <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-ink-500">
          Thanks, Dr. {doctor?.full_name}. Your registration is with our team for review — you&apos;ll get
          access to patient records once an admin approves your account.
        </p>

        {/* This screen is outside the app shell, so without this link a
            doctor awaiting (or re-awaiting) approval has no route to their
            own profile — which is exactly where they'd go to correct
            whatever is holding the review up. */}
        <Link
          to="/doctor/profile"
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-purple underline-offset-2 hover:underline"
        >
          <UserCog size={13} /> View or edit my profile
        </Link>

        <div className="mt-6 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-lavender px-4 py-2.5 text-sm font-semibold text-brand-purple transition-colors hover:bg-brand-lavender/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40 disabled:opacity-60"
          >
            <RefreshCw size={14} className={checking ? 'hn-spin' : ''} />
            {checking ? 'Checking…' : 'Check status'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/70 px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/30"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

        <SecurityBadge />
      </AuthCard>
    </AuthShell>
  );
}
