import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, RotateCw } from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  DevOtpChip,
  FormError,
  CuraPathLogo,
  OTPInput,
  PhoneField,
  PrimaryButton,
  SecurityBadge,
  Step,
  StepHeading,
  SuccessOverlay,
  consumedVerifyAttempt,
  describeSendOtpError,
  describeVerifyOtpError,
  useOtpTimers,
} from '@shared/auth';
import { usePhoneInput } from '@shared/components/PhoneInput';
import { useSession } from '@shared/session/SessionContext';

type StepName = 'phone' | 'otp' | 'staff';

/** How long the success beat holds before the app takes over. */
const SUCCESS_HOLD_MS = 1250;

/**
 * /login — the one sign-in for the whole website, matching the mobile app.
 *
 * Patients and doctors use the same screen and the same account: everyone
 * lands in User mode, registers as a doctor from there if they are one, and
 * switches modes afterwards. Where a signed-in account lands is decided by
 * the session (mode last used, or profile setup for a new account), not here.
 *
 * A staff number is recognised and handed to the Admin Portal with its
 * session already in place, so staff do not enter a second code.
 */
export default function Login() {
  const { isAuthenticated, account, sendOtp, verifyOtp } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Where the person was headed before a route gate sent them here. Only
  // ever an in-app path set by our own gates, never read from the URL.
  const from = (location.state as { from?: string } | null)?.from;

  const [step, setStep] = useState<StepName>('phone');
  const [target, setTarget] = useState<string | null>(null);

  const { country, setCountry, digits, setDigits, isComplete, fullNumber, reset: resetPhone } = usePhoneInput();
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [rejectedAttempts, setRejectedAttempts] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const timers = useOtpTimers();

  async function handleSendOtp(isResend = false) {
    setError(null);
    setSending(true);
    try {
      const result = await sendOtp(fullNumber);
      // The backend only includes this when it runs with DEBUG and no SMS
      // gateway. A production build never shows it, so a misconfigured
      // server fails loudly instead of looking like a working login.
      setDebugOtp(import.meta.env.DEV ? (result.debug_otp ?? null) : null);
      setOtp('');
      // Attempts are NOT reset here: a resend inside the code's lifetime
      // re-sends the same code, and the backend carries its attempt count
      // over. Only a new phone number (backToPhone) starts afresh.
      timers.startCycle();
      if (!isResend) setStep('otp');
    } catch (err) {
      setError(describeSendOtpError(err));
    } finally {
      setSending(false);
    }
  }

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (code.length !== 6 || verifying) return;
      setError(null);
      setVerifying(true);
      try {
        const result = await verifyOtp(fullNumber, code);
        if (result.kind === 'staff') {
          setStep('staff');
          setTimeout(() => navigate('/admin', { replace: true }), 1400);
          return;
        }
        setTarget(from ?? result.home);
      } catch (err) {
        setError(describeVerifyOtpError(err, { rejectedAttempts }));
        if (consumedVerifyAttempt(err)) setRejectedAttempts((n) => n + 1);
        setOtp('');
      } finally {
        setVerifying(false);
      }
    },
    [from, fullNumber, navigate, rejectedAttempts, verifyOtp, verifying]
  );

  // The success card holds for a beat, then hands over to the app.
  useEffect(() => {
    if (!target) return;
    const id = setTimeout(() => navigate(target, { replace: true }), SUCCESS_HOLD_MS);
    return () => clearTimeout(id);
  }, [target, navigate]);

  function backToPhone() {
    resetPhone();
    setOtp('');
    setDebugOtp(null);
    setError(null);
    setRejectedAttempts(0);
    timers.reset();
    setStep('phone');
  }

  // Already signed in (a bookmark, the back button): nothing to do here.
  if (isAuthenticated && account && !target && !verifying && step !== 'staff') {
    return <Navigate to="/" replace />;
  }

  const isNewProfile = target === '/patient/setup';

  return (
    <AuthShell>
      <AuthCard>
        <AnimatePresence>
          {target && (
            <SuccessOverlay
              title={isNewProfile ? 'Number verified' : 'Welcome back!'}
              subtitle={isNewProfile ? 'Let’s set up your profile…' : 'Opening CuraPath…'}
            />
          )}
        </AnimatePresence>

        {/* The step before this one: the landing page at "/". */}
        {step === 'phone' && (
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>
        )}

        <div className="mb-6">
          <CuraPathLogo portal="patient" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'phone' && (
            <Step key="phone">
              <StepHeading
                title={<>Welcome <span aria-hidden="true">👋</span></>}
                subtitle="Sign in with your mobile number to continue"
              />

              <PhoneField
                country={country}
                onCountryChange={setCountry}
                digits={digits}
                onDigitsChange={setDigits}
                onSubmit={() => isComplete && handleSendOtp()}
                disabled={sending}
              />

              <FormError message={error} />

              <div className="mt-5">
                <PrimaryButton
                  state={sending ? 'loading' : 'idle'}
                  loadingLabel="Sending code…"
                  disabled={!isComplete}
                  onClick={() => handleSendOtp()}
                >
                  Send OTP
                </PrimaryButton>
              </div>

              <SecurityBadge />

              {/* There is no separate sign-up, and no separate doctor login:
                  accounts/views.py creates the account on first successful
                  verification, and a doctor registers from inside it. */}
              <p className="mt-5 border-t border-border/70 pt-4 text-center text-[11.5px] leading-relaxed text-ink-500">
                New to CuraPath? Just enter your number — signing in for the first time creates your account.
                Doctors sign in here too, then register from <span className="font-medium text-ink-700">Register as a doctor</span>.
              </p>
            </Step>
          )}

          {step === 'otp' && (
            <Step key="otp">
              <StepHeading
                title="Enter the 6-digit code"
                subtitle={
                  <>
                    Sent to <span className="font-medium text-ink-700">{fullNumber}</span>
                    {' · '}
                    <button
                      type="button"
                      onClick={backToPhone}
                      className="font-medium text-brand-purple underline-offset-2 hover:underline"
                    >
                      change
                    </button>
                  </>
                }
              />

              {debugOtp && (
                <div className="mb-4">
                  <DevOtpChip code={debugOtp} onUse={setOtp} />
                </div>
              )}

              <OTPInput
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  if (error) setError(null);
                }}
                onComplete={handleVerifyOtp}
                disabled={verifying}
                invalid={!!error}
                autoFocus
              />

              <div className="mt-3 flex items-center justify-end text-[11.5px]">
                <ResendButton
                  canResend={timers.canResend}
                  resendIn={timers.resendIn}
                  exhausted={timers.sendsExhausted}
                  sending={sending}
                  onResend={() => handleSendOtp(true)}
                />
              </div>

              {/* Shown for the whole OTP step, not just on error: the usual
                  reason someone stalls here is a code that has not arrived
                  yet, and silence at that moment reads as the app being
                  broken. Plain text, not a mailto: neither support domain
                  has MX records today. */}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                {timers.sendsExhausted
                  ? 'Try again in about an hour, or contact support if this keeps happening.'
                  : "Didn't get a code? Check your signal, wait a minute — delivery can lag — or use Resend above."}
              </p>

              <FormError message={error} />

              <div className="mt-5">
                <PrimaryButton
                  state={verifying ? 'loading' : 'idle'}
                  loadingLabel="Verifying…"
                  disabled={otp.length !== 6}
                  onClick={() => handleVerifyOtp(otp)}
                >
                  Verify &amp; Login
                </PrimaryButton>
              </div>

              <SecurityBadge />
            </Step>
          )}

          {step === 'staff' && (
            <Step key="staff">
              <div className="py-2 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-lavender text-brand-purple">
                  <ArrowUpRight size={22} />
                </div>
                <p className="text-[15px] font-semibold text-ink-900">Staff account recognised</p>
                <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-ink-500">
                  Opening the Admin Portal…
                </p>
                <Link
                  to="/admin"
                  replace
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-purple underline-offset-2 hover:underline"
                >
                  Not redirected? Continue to Admin Portal
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            </Step>
          )}
        </AnimatePresence>
      </AuthCard>
    </AuthShell>
  );
}

/**
 * Resend, with the backend's two limits made visible rather than
 * discovered by hitting them: a 60-second cooldown between sends, and a
 * hard stop at five codes an hour.
 */
function ResendButton({
  canResend,
  resendIn,
  exhausted,
  sending,
  onResend,
}: {
  canResend: boolean;
  resendIn: number;
  exhausted: boolean;
  sending: boolean;
  onResend: () => void;
}) {
  if (exhausted) {
    return <span className="text-ink-300">No codes left this hour</span>;
  }
  if (!canResend) {
    return <span className="text-ink-300">Resend code in {resendIn}s</span>;
  }
  return (
    <button
      type="button"
      onClick={onResend}
      disabled={sending}
      className="inline-flex items-center gap-1 font-semibold text-brand-purple underline-offset-2 hover:underline disabled:opacity-50"
    >
      <RotateCw size={11} className={sending ? 'hn-spin' : ''} />
      Resend code
    </button>
  );
}
