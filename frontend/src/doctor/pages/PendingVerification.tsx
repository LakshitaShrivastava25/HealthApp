import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock3, LogOut, RefreshCw, User, UserCog, XCircle } from 'lucide-react';
import { AuthCard, AuthShell, CuraPathLogo, SecurityBadge } from '@shared/auth';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogoutConfirm } from '@shared/hooks/useLogoutConfirm';

/**
 * Where a registered-but-unverified doctor waits — the mobile app's
 * doctor-setup/pending screen on the web. Also where a rejected doctor
 * lands, which is why the profile stays one click away: a rejection is only
 * actionable if the details behind it can be corrected.
 *
 * The rest of the account keeps working meanwhile: "Switch to user mode"
 * goes back to the person's own records on the same sign-in.
 */
export default function PendingVerification() {
  const { doctor, refreshDoctor, logout } = useAuth();
  const { requestLogout, dialog: logoutDialog } = useLogoutConfirm(logout);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  if (doctor?.verification_status === 'verified') return <Navigate to="/doctor" replace />;

  const rejected = doctor?.verification_status === 'rejected';

  async function handleCheck() {
    setChecking(true);
    setCheckFailed(false);
    try {
      // An approval since the last check moves straight on to the portal
      // (the redirect above), no reload needed.
      await refreshDoctor();
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard className="text-center">
        <div className="mb-6">
          <CuraPathLogo portal="doctor" />
        </div>

        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
          {rejected ? (
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-danger-bg text-danger">
              <XCircle size={24} />
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink-900">
          {rejected ? 'Registration not approved' : doctor?.verification_status === 'pending' ? 'Verification pending' : 'Under review'}
        </h1>
        <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-ink-500">
          {rejected
            ? 'An administrator reviewed your registration and did not approve it. Correcting your details in your profile sends it back for review.'
            : doctor?.verification_status === 'failed'
              ? "We couldn't reach the medical register right now — your registration will be verified shortly. An admin can still review it in the meantime."
              : <>Thanks, Dr. {doctor?.full_name}. Your registration number and licence are with our team for review — you&apos;ll be able to request patient access once an admin approves your account.</>}
        </p>

        {rejected && doctor?.rejection_reason && (
          <p className="mx-auto mt-3 max-w-[320px] rounded-lg bg-danger-bg px-3 py-2 text-left text-[12.5px] text-danger">
            <strong>Reason:</strong> {doctor.rejection_reason}
          </p>
        )}

        {/* What the NMC register check found, so the doctor knows where
            their registration stands before an admin gets to it. */}
        {!rejected && doctor?.nmc_result === 'found' && (
          <p className="mx-auto mt-3 max-w-[320px] rounded-lg bg-success-bg px-3 py-2 text-left text-[12.5px] text-success">
            Found on the NMC register as <strong>{doctor.nmc_name}</strong>
            {doctor.nmc_qualification ? ` (${doctor.nmc_qualification})` : ''}.
          </p>
        )}
        {!rejected && doctor?.nmc_result === 'not_found' && (
          <p className="mx-auto mt-3 max-w-[320px] rounded-lg bg-warning-bg px-3 py-2 text-left text-[12.5px] text-warning">
            Your registration number wasn&apos;t found in {doctor.state_council_name || 'that council'} on the NMC
            register. If it&apos;s mistyped, correct it in your profile.
          </p>
        )}

        {/* This screen is outside the app shell, so without this link a
            doctor awaiting (or re-awaiting) approval has no route to their
            own profile — which is exactly where they'd go to correct
            whatever is holding the review up. */}
        <Link
          to="/doctor/profile"
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-purple underline-offset-2 hover:underline"
        >
          <UserCog size={13} /> {rejected ? 'Correct my details' : 'View or edit my profile'}
        </Link>

        {checkFailed && (
          <p className="mt-3 text-[12px] text-danger">Couldn&apos;t check right now. Please try again.</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
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
            onClick={() => navigate('/patient')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/70 px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/30"
          >
            <User size={14} />
            Switch to user mode
          </button>
        </div>

        <button
          type="button"
          onClick={requestLogout}
          className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-500 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/30"
        >
          <LogOut size={13} />
          Sign out
        </button>
        {logoutDialog}

        <SecurityBadge />
      </AuthCard>
    </AuthShell>
  );
}
