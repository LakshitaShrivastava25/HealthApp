import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, RotateCw } from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  ChooseStep,
  DevOtpChip,
  FormError,
  CuraPathLogo,
  OTPInput,
  PIN_LENGTH,
  PhoneField,
  PrimaryButton,
  SecurityBadge,
  BackButton,
  Step,
  StepHeading,
  SuccessOverlay,
  consumedVerifyAttempt,
  describeSendOtpError,
  describeVerifyOtpError,
  useOtpTimers,
} from '@shared/auth';
import { usePhoneInput } from '@shared/components/PhoneInput';
import { COUNTRIES } from '@shared/data/countries';
import { useSession } from '@shared/session/SessionContext';
import { usePin, type PinOwner } from '@shared/session/PinContext';
import { mpinApi } from '@shared/session/mpinApi';
import { getPinHint, maskPhone } from '@shared/session/pin';
import axios from 'axios';
import { useBackToClose } from '@shared/hooks/useBackToClose';

type StepName = 'phone' | 'pin' | 'otp' | 'set-pin' | 'staff';

/** How long the success beat holds before the app takes over. */
const SUCCESS_HOLD_MS = 1250;

/** 65 -> "1:05" */
function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

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
 *
 * One Continue after the number: a registered account with a PIN goes to
 * the PIN (on any browser); a new number gets a one-time code and then the
 * registration page (details + PIN + confirm PIN). A code is otherwise only
 * for Forgot PIN. A browser that has signed in before pre-fills its number.
 */
export default function Login() {
  const { isAuthenticated, account, sendOtp, verifyOtp, adoptSession, logout } = useSession();
  const pin = usePin();
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

  // --- PIN sign-in state -------------------------------------------------
  const [knownPhone] = useState(() => getPinHint()?.phone ?? null);
  const [mpin, setMpin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  /** The code step is for Forgot PIN (ends at "choose a new PIN"), not sign-in. */
  const [resetting, setResetting] = useState(false);
  const [grant, setGrant] = useState('');
  /** Where to go once the PIN is set. */
  const [home, setHome] = useState('/');
  /** The account just signed in, whose PIN is being set. */
  const [owner, setOwner] = useState<PinOwner | null>(null);

  // Pre-fill the number this browser last signed in with, so a returning
  // person only types their PIN.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !knownPhone) return;
    prefilled.current = true;
    const match = [...COUNTRIES]
      .sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((c) => knownPhone.startsWith(c.dialCode));
    if (!match) return;
    setCountry(match);
    setDigits(knownPhone.slice(match.dialCode.length));
  }, [knownPhone, setCountry, setDigits]);

  /**
   * Whether the PIN leads. Only when this browser has signed in before *and*
   * the number on screen is still that one — a different number's PIN would
   * belong to someone else's account.
   */
  const pinFirst = !!knownPhone && fullNumber === knownPhone;

  // Seconds still to wait, counted from the server's own deadline.
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!pin.waitUntil) {
      setWaitSeconds(0);
      return;
    }
    const until = pin.waitUntil;
    const tick = () => setWaitSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pin.waitUntil]);

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

  const [checking, setChecking] = useState(false);

  /** Registered with a PIN -> PIN step. New number (or no PIN yet) -> code. */
  async function handleContinue() {
    if (!isComplete || sending || checking) return;
    setError(null);
    pin.clearError();
    setMpin('');
    setResetting(false);
    if (pinFirst) {
      setStep('pin');
      return;
    }
    setChecking(true);
    let next: 'pin' | 'otp' = 'pin';
    try {
      ({ next } = (await mpinApi.checkNumber(fullNumber)).data);
    } catch (err) {
      // An API without the lookup (404) can still take the PIN; anything
      // else is shown, rather than guessing which way to send them.
      if (!(axios.isAxiosError(err) && err.response?.status === 404)) {
        setError(
          axios.isAxiosError(err) && err.response?.status === 429
            ? 'Too many attempts. Please wait a few minutes and try again.'
            : 'Could not reach CuraPath. Check your connection and try again.'
        );
        return;
      }
    } finally {
      setChecking(false);
    }
    if (next === 'pin') setStep('pin');
    else void handleSendOtp();
  }

  const handlePinSignIn = useCallback(
    async (code: string) => {
      if (code.length !== PIN_LENGTH || pinBusy || waitSeconds > 0) return;
      setPinBusy(true);
      try {
        const result = await pin.signInWithPin(fullNumber, code);
        if (!result) {
          setMpin('');
          return;
        }
        if (result.kind === 'staff') {
          setStep('staff');
          return;
        }
        setTarget(from ?? result.home);
      } finally {
        setPinBusy(false);
      }
    },
    [from, fullNumber, pin, pinBusy, waitSeconds]
  );

  /** Forgot PIN: the same code flow, but it ends at "choose a new PIN". */
  function handleForgotPin() {
    setError(null);
    pin.clearError();
    setResetting(true);
    setMpin('');
    void handleSendOtp();
  }

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (code.length !== 6 || verifying) return;
      setError(null);
      setVerifying(true);
      try {
        if (resetting) {
          // Forgot PIN: trade the code for a grant (which also signs them
          // in), then let them choose a new PIN.
          const { data } = await mpinApi.grant(fullNumber, code);
          const result = await adoptSession(data);
          if (result.kind === 'staff') {
            setStep('staff');
            return;
          }
          setGrant(data.grant);
          setHome(from ?? result.home);
          setOwner(result.account);
          setStep('set-pin');
          return;
        }
        const result = await verifyOtp(fullNumber, code);
        if (result.kind === 'staff') {
          setStep('staff');
          return;
        }
        if (result.hasMpin) {
          // They already have a PIN; this code only registers the browser.
          await pin.registerDevice(result.account).catch(() => undefined);
          setTarget(from ?? result.home);
        } else if (result.home === '/patient/setup') {
          // New account: the registration page takes their details and the
          // PIN (with confirmation) on one screen.
          setTarget(result.home);
        } else {
          // An older account with a profile but no PIN yet: just the PIN.
          setHome(from ?? result.home);
          setOwner(result.account);
          setStep('set-pin');
        }
      } catch (err) {
        setError(describeVerifyOtpError(err, { rejectedAttempts }));
        if (consumedVerifyAttempt(err)) setRejectedAttempts((n) => n + 1);
        setOtp('');
      } finally {
        setVerifying(false);
      }
    },
    [adoptSession, from, fullNumber, pin, rejectedAttempts, resetting, verifyOtp, verifying]
  );

  // The success card holds for a beat, then hands over to the app.
  useEffect(() => {
    if (!target) return;
    const id = setTimeout(() => navigate(target, { replace: true }), SUCCESS_HOLD_MS);
    return () => clearTimeout(id);
  }, [target, navigate]);

  // Staff: the same beat, then the Admin Portal. Cleared if the page goes
  // away first, so it can never pull someone back from elsewhere.
  useEffect(() => {
    if (step !== 'staff') return;
    const id = setTimeout(() => navigate('/admin', { replace: true }), 1400);
    return () => clearTimeout(id);
  }, [step, navigate]);

  /**
   * One step back, for the on-screen "← Back" and the browser's Back alike:
   *   PIN                 -> phone number (number kept)
   *   code, resetting PIN -> PIN
   *   code                -> phone number
   *   choosing a PIN      -> phone number, signed out — that step runs on the
   *                          session the code just opened, and leaving it
   *                          half-done must not leave anyone signed in.
   */
  function goBackStep() {
    setOtp('');
    setMpin('');
    setError(null);
    pin.clearError();
    if (step === 'otp' && resetting) {
      setResetting(false);
      setStep('pin');
      return;
    }
    if (step === 'set-pin') {
      logout();
      setResetting(false);
      setGrant('');
    }
    timers.reset();
    setStep('phone');
  }

  // On every step past the phone number, Back moves one step back instead of
  // leaving the login page.
  useBackToClose(step === 'otp' || step === 'pin' || step === 'set-pin', goBackStep);

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
  // Not while choosing a PIN, though — that step runs signed in.
  if (
    isAuthenticated &&
    account &&
    !target &&
    !verifying &&
    !pinBusy &&
    step !== 'staff' &&
    step !== 'set-pin'
  ) {
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
                title={pinFirst ? 'Welcome back' : <>Welcome <span aria-hidden="true">👋</span></>}
                subtitle={
                  pinFirst
                    ? 'Enter your PIN to sign in. Forgot it? You can reset it on the next screen.'
                    : 'Enter your mobile number to continue'
                }
              />

              <PhoneField
                country={country}
                onCountryChange={setCountry}
                digits={digits}
                onDigitsChange={setDigits}
                onSubmit={handleContinue}
                disabled={sending}
                hint={
                  pinFirst
                    ? 'This browser is set up for PIN sign-in — no code needed.'
                    : 'Registered? You’ll enter your PIN next. New here? We’ll text you a code.'
                }
              />

              <FormError message={error} />

              <div className="mt-5">
                <PrimaryButton
                  state={checking || sending ? 'loading' : 'idle'}
                  loadingLabel={sending ? 'Sending code…' : 'Checking…'}
                  disabled={!isComplete}
                  onClick={handleContinue}
                >
                  Continue
                </PrimaryButton>
              </div>

              <SecurityBadge />

              {/* There is no separate sign-up, and no separate doctor login:
                  accounts/views.py creates the account on first successful
                  verification, and a doctor registers from inside it. */}
              <p className="mt-5 border-t border-border/70 pt-4 text-center text-[11.5px] leading-relaxed text-ink-500">
                New to CuraPath? Enter your number — we verify it with a code, then you add your details and set a
                PIN. Doctors sign in here too, then register from{' '}
                <span className="font-medium text-ink-700">Register as a doctor</span>.
              </p>
            </Step>
          )}

          {step === 'pin' && (
            <Step key="pin">
              <BackButton onClick={goBackStep} disabled={pinBusy} />
              <StepHeading
                title="Enter your PIN"
                subtitle={
                  <>
                    For <span className="font-medium text-ink-700">{maskPhone(fullNumber)}</span>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => {
                        setMpin('');
                        pin.clearError();
                        setStep('phone');
                      }}
                      className="font-medium text-brand-purple underline-offset-2 hover:underline"
                    >
                      change
                    </button>
                  </>
                }
              />

              <div className="mx-auto max-w-[248px]">
                <OTPInput
                  value={mpin}
                  onChange={(v) => {
                    setMpin(v);
                    if (pin.error) pin.clearError();
                  }}
                  onComplete={handlePinSignIn}
                  length={PIN_LENGTH}
                  masked
                  label="PIN"
                  disabled={pinBusy || waitSeconds > 0}
                  invalid={!!pin.error}
                  autoFocus
                />
              </div>

              {waitSeconds > 0 ? (
                <p className="mt-3 text-center text-[12px] font-medium text-warning">
                  Too many wrong tries. Try again in {formatWait(waitSeconds)}, or reset your PIN.
                </p>
              ) : (
                pin.attemptsLeft != null &&
                pin.attemptsLeft > 0 &&
                !pin.error && (
                  <p className="mt-3 text-center text-[12px] text-ink-500">
                    {pin.attemptsLeft} {pin.attemptsLeft === 1 ? 'try' : 'tries'} left
                  </p>
                )
              )}

              <FormError message={pin.error ?? error} />

              {pinBusy && <p className="mt-3 text-center text-[12px] text-ink-500">Signing in…</p>}

              <button
                type="button"
                onClick={handleForgotPin}
                disabled={pinBusy || sending}
                className="mt-5 block w-full text-center text-[12.5px] font-semibold text-brand-purple underline-offset-2 hover:underline disabled:opacity-50"
              >
                {sending ? 'Sending code…' : 'Forgot PIN?'}
              </button>


              <SecurityBadge />
            </Step>
          )}

          {step === 'otp' && (
            <Step key="otp">
              <BackButton onClick={goBackStep} disabled={verifying} />
              <StepHeading
                title={resetting ? 'Reset your PIN' : 'Enter the 6-digit code'}
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
                  {resetting ? 'Verify' : <>Verify &amp; Login</>}
                </PrimaryButton>
              </div>

              <SecurityBadge />
            </Step>
          )}

          {step === 'set-pin' && (
            <Step key="set-pin">
              <BackButton onClick={goBackStep} />
              <ChooseStep
                title={resetting ? 'Set a new PIN' : 'Create your PIN'}
                subtitle="You will use this to sign in from now on, instead of waiting for a code each time."
                onDone={async (next) => {
                  await pin.setPin(next, grant || undefined, owner);
                  setTarget(home);
                }}
              />
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
