import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Lock, RotateCw } from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  DevOtpChip,
  FormError,
  HealthNowLogo,
  OTPInput,
  PhoneField,
  PrimaryButton,
  SecurityBadge,
  Step,
  StepHeading,
  SuccessOverlay,
  describeSendOtpError,
  describeVerifyOtpError,
  formatMmSs,
  useOtpTimers,
} from '@shared/auth';
import { useAuth } from '../context/AuthContext';
import { usePhoneInput } from '@shared/components/PhoneInput';

type StepName = 'phone' | 'otp';

/** How long the success beat holds before the portal takes over. */
const SUCCESS_HOLD_MS = 1200;

export default function Login() {
  const { sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<StepName>('phone');
  const [verified, setVerified] = useState(false);

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
      setDebugOtp(result.debug_otp ?? null);
      setOtp('');
      setRejectedAttempts(0);
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
        if (result.ok) {
          setVerified(true);
        } else {
          // The code was right but the account isn't staff. That's a
          // different failure from a bad code and must not shake the
          // boxes or burn an "attempts left" count.
          setError(result.error || 'This account does not have staff access.');
          setOtp('');
        }
      } catch (err) {
        setError(describeVerifyOtpError(err, { expired: timers.isExpired, rejectedAttempts }));
        setRejectedAttempts((n) => n + 1);
        setOtp('');
      } finally {
        setVerifying(false);
      }
    },
    [fullNumber, rejectedAttempts, timers.isExpired, verifyOtp, verifying]
  );

  useEffect(() => {
    if (!verified) return;
    const id = setTimeout(() => navigate('/', { replace: true }), SUCCESS_HOLD_MS);
    return () => clearTimeout(id);
  }, [verified, navigate]);

  function backToPhone() {
    resetPhone();
    setOtp('');
    setDebugOtp(null);
    setError(null);
    setRejectedAttempts(0);
    timers.reset();
    setStep('phone');
  }

  return (
    <AuthShell>
      <AuthCard>
        <AnimatePresence>
          {verified && <SuccessOverlay title="Verified" subtitle="Opening the admin console…" />}
        </AnimatePresence>

        <div className="mb-6">
          <HealthNowLogo portal="admin" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'phone' && (
            <Step key="phone">
              <StepHeading
                title="Staff sign-in"
                subtitle={
                  <span className="inline-flex items-center gap-1">
                    <Lock size={11} />
                    Restricted to HealthNow staff accounts.
                  </span>
                }
              />

              <PhoneField
                label="Staff phone number"
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

              <SecurityBadge label="Secured & encrypted · access is audited" />
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
                disabled={verifying || timers.sendsExhausted}
                invalid={!!error}
                autoFocus
              />

              <div className="mt-3 flex items-center justify-between text-[11.5px]">
                <span className={timers.expiresIn === 0 ? 'text-danger' : 'text-ink-500'}>
                  {timers.expiresIn === 0 ? 'Code expired' : `Expires in ${formatMmSs(timers.expiresIn)}`}
                </span>

                {timers.sendsExhausted ? (
                  <span className="text-ink-300">No codes left this hour</span>
                ) : timers.canResend ? (
                  <button
                    type="button"
                    onClick={() => handleSendOtp(true)}
                    disabled={sending}
                    className="inline-flex items-center gap-1 font-semibold text-brand-purple underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    <RotateCw size={11} className={sending ? 'hn-spin' : ''} />
                    Resend code
                  </button>
                ) : (
                  <span className="text-ink-300">Resend in {timers.resendIn}s</span>
                )}
              </div>

              <FormError message={error} />

              <div className="mt-5">
                <PrimaryButton
                  state={verifying ? 'loading' : 'idle'}
                  loadingLabel="Verifying…"
                  disabled={otp.length !== 6}
                  onClick={() => handleVerifyOtp(otp)}
                >
                  Verify &amp; Continue
                </PrimaryButton>
              </div>

              <SecurityBadge label="Secured & encrypted · access is audited" />
            </Step>
          )}
        </AnimatePresence>
      </AuthCard>
    </AuthShell>
  );
}
