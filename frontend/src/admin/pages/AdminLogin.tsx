import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';

import {
  AuthCard,
  AuthShell,
  CuraPathLogo,
  Field,
  FormError,
  PrimaryButton,
  SecurityBadge,
  Step,
  StepHeading,
} from '@shared/auth';
import { useAuth } from '../context/AuthContext';

/**
 * curapath.in/admin — the Admin Portal's own sign-in, with email and
 * password. Shown in place of whichever admin page was asked for, so after
 * signing in the person is already where they meant to go (a deep link like
 * /admin/doctor-verification survives sign-in).
 *
 * The account is a normal staff account: the same one reached by OTP at
 * /login, which keeps working. Email + password is set on the server with
 * `manage.py set_staff_login`.
 */
export default function AdminLogin() {
  const { loginWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      await loginWithPassword(email.trim(), password);
      // The portal renders in place of this form as soon as the session is set.
    } catch (err) {
      setError(describeError(err));
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={14} /> Back to home
        </Link>

        <div className="mb-6">
          <CuraPathLogo portal="admin" />
        </div>

        <Step>
          <StepHeading title="Admin sign in" subtitle="Sign in with your CuraPath staff email and password" />

          <form onSubmit={handleSubmit} noValidate>
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              placeholder="admin@curapath.com"
              icon={<Mail size={16} />}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
            />

            <Field
              className="mt-4"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              icon={<LockKeyhole size={16} />}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-surface hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <FormError message={error} />

            <div className="mt-5">
              <PrimaryButton type="submit" state={busy ? 'loading' : 'idle'} loadingLabel="Signing in…" disabled={!canSubmit}>
                Sign in
              </PrimaryButton>
            </div>
          </form>

          <SecurityBadge label="Staff only · every sign-in is logged" />

          <p className="mt-5 border-t border-border/70 pt-4 text-center text-[11.5px] leading-relaxed text-ink-500">
            Staff with a registered phone number can also{' '}
            <Link to="/login" className="font-medium text-brand-purple underline-offset-2 hover:underline">
              sign in with an OTP
            </Link>
            .
          </p>
        </Step>
      </AuthCard>
    </AuthShell>
  );
}

function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: string; retry_after?: number } | undefined) ?? {};
    if (!err.response) return "Couldn't reach CuraPath. Check your connection — the server can take up to a minute to wake up.";
    // A locked account explains itself (with retry_after); the per-device
    // rate limit does not, so it gets a plain sentence instead of DRF's.
    if (status === 429 && detail.retry_after) return detail.detail ?? 'Too many attempts. Try again later.';
    if (status === 429) return 'Too many sign-in attempts from this device. Please wait a while and try again.';
    if (status === 401 || status === 403 || status === 400) return detail.detail ?? 'Email or password is incorrect.';
    return 'Something went wrong signing you in. Please try again.';
  }
  if (err instanceof Error && err.message === 'not-staff') return 'This account does not have access to the Admin Portal.';
  return 'Something went wrong signing you in. Please try again.';
}
