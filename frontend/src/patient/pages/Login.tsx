import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpRight, CalendarDays, Droplet, RotateCw, User, Users } from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  DevOtpChip,
  Field,
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
import { useAuth } from '../context/AuthContext';
import { clearTokens, getAccessToken, getRefreshToken, profilesApi } from '../lib/api';
import { setTokens as setAdminTokens } from '../../admin/lib/api';
import { usePhoneInput } from '@shared/components/PhoneInput';

type StepName = 'phone' | 'otp' | 'profile' | 'staff';
type Success = null | 'welcome' | 'allset';

const STAFF_ROLES = ['admin', 'ocr_reviewer', 'claims_ops'];

/** How long the success beat holds before the dashboard takes over. */
const SUCCESS_HOLD_MS = 1250;

/** yyyy-mm-dd from local parts — toISOString() would use UTC and can land
 *  on the wrong day for anyone east or west of it near midnight. */
function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Caps the date picker so a birthdate can't be set in the future. */
const TODAY_ISO = toIsoDate(new Date());

/**
 * Age in whole years, computed from the yyyy-mm-dd the date input gives us.
 *
 * The string is split by hand rather than passed to new Date(iso): that
 * form is parsed as UTC midnight, which reads back as the previous day in
 * any negative-offset timezone and would show some people an age a year
 * out on their birthday.
 */
function calculateAge(iso: string): number | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const hadBirthdayThisYear = thisMonth > m || (thisMonth === m && today.getDate() >= d);
  return today.getFullYear() - y - (hadBirthdayThisYear ? 0 : 1);
}

/** The live age line under the date picker. Never sent to the server. */
function describeAge(iso: string): string {
  if (!iso) return 'Your age is worked out from this — we store the date, not the age.';
  const age = calculateAge(iso);
  if (age === null) return 'Enter a full date to see your age.';
  if (age < 0) return 'That date is in the future — please check it.';
  if (age === 0) return 'Age: under 1 year';
  return `Age: ${age} ${age === 1 ? 'year' : 'years'}`;
}

export default function Login() {
  const { sendOtp, verifyOtp, refreshProfiles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Where the person was actually headed before RequireAuth bounced them
  // here. Without this every sign-in lands on the dashboard, which is
  // wrong for anyone who followed a link to, say, their emergency card.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [step, setStep] = useState<StepName>('phone');
  const [success, setSuccess] = useState<Success>(null);

  const { country, setCountry, digits, setDigits, isComplete, fullNumber, reset: resetPhone } = usePhoneInput();
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [rejectedAttempts, setRejectedAttempts] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const timers = useOtpTimers();

  async function handleSendOtp(isResend = false) {
    setError(null);
    setSending(true);
    try {
      const result = await sendOtp(fullNumber);
      // Only present when the backend runs with DEBUG=True.
      setDebugOtp(result.debug_otp ?? null);
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
        const role = await verifyOtp(fullNumber, code);

        if (role && STAFF_ROLES.includes(role)) {
          // This phone number belongs to a staff account, so it must not
          // hold a patient session. The OTP it just passed is a real staff
          // login though, so hand the tokens straight to the Admin Portal's
          // own storage keys instead of asking for a second code.
          //
          // Deliberately NOT logout(): that would also tell the server to
          // blacklist this refresh token, which the Admin Portal is about
          // to use. clearTokens() only drops the patient copy locally.
          const access = getAccessToken();
          const refresh = getRefreshToken();
          clearTokens();
          if (access && refresh) setAdminTokens(access, refresh);
          setStep('staff');
          setTimeout(() => {
            navigate('/admin', { replace: true });
          }, 1200);
          return;
        }

        await refreshProfiles();
        // refreshProfiles updates context asynchronously — check directly
        // via API to decide whether this is a brand-new account needing
        // profile setup.
        const { data } = await profilesApi.list();
        const list = data.results ?? data;

        if (list.length === 0) {
          // A first-time account has never been here, so it gets no
          // "welcome back" — it goes straight on to finish signing up.
          setStep('profile');
        } else {
          setSuccess('welcome');
        }
      } catch (err) {
        setError(describeVerifyOtpError(err, { rejectedAttempts }));
        if (consumedVerifyAttempt(err)) setRejectedAttempts((n) => n + 1);
        setOtp('');
      } finally {
        setVerifying(false);
      }
    },
    [fullNumber, navigate, refreshProfiles, rejectedAttempts, verifyOtp, verifying]
  );

  async function handleProfileSetup() {
    setError(null);
    setSavingProfile(true);
    try {
      // Age is deliberately absent here. It's derived from date_of_birth
      // for display only — storing it would be wrong the day after signup.
      await profilesApi.create({
        full_name: fullName,
        relation: 'self',
        blood_group: bloodGroup,
        date_of_birth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      await refreshProfiles();
      setSuccess('allset');
    } catch {
      setError('Could not save your profile. Please try again.');
      setSavingProfile(false);
    }
  }

  // The success card holds for a beat, then hands over to the app.
  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => navigate(from, { replace: true }), SUCCESS_HOLD_MS);
    return () => clearTimeout(id);
  }, [success, from, navigate]);

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
          {success === 'welcome' && <SuccessOverlay title="Welcome back!" subtitle="Opening your dashboard…" />}
          {success === 'allset' && (
            <SuccessOverlay title="You're all set" subtitle="Taking you to your dashboard…" />
          )}
        </AnimatePresence>

        <div className="mb-6">
          <CuraPathLogo portal="patient" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'phone' && (
            <Step key="phone">
              <StepHeading
                title={<>Welcome back <span aria-hidden="true">👋</span></>}
                subtitle="Sign in to continue to your account"
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

              {/* There is no separate sign-up: accounts/views.py creates the
                  account on first successful verification. Saying so is
                  more honest than a "Create account" link that would only
                  lead back to this same field. */}
              <p className="mt-5 border-t border-border/70 pt-4 text-center text-[11.5px] leading-relaxed text-ink-500">
                New to CuraPath? Just enter your number — signing in for the first time creates your account.
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
                  reason someone stalls here is a code that simply has not
                  arrived yet, and silence at that moment reads as the app
                  being broken. When sends are exhausted this becomes the
                  way out, so "No codes left this hour" above is a status
                  rather than a dead end. Plain text, not a mailto: neither
                  support domain has MX records today, so a link would
                  promise a reply that cannot arrive. */}
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

          {step === 'profile' && (
            <Step key="profile">
              <StepHeading
                title="Complete your profile"
                subtitle="Just the basics — you can add more later in Settings."
              />

              <div className="space-y-3.5">
                <Field
                  label="Full name"
                  icon={<User size={15} />}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Anjali Mehta"
                  autoComplete="name"
                  autoFocus
                />
                <Field
                  label="Date of birth"
                  icon={<CalendarDays size={15} />}
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={TODAY_ISO}
                  hint={describeAge(dateOfBirth)}
                />
                <SelectField
                  label="Gender"
                  icon={<Users size={15} />}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Select (optional)</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </SelectField>
                <Field
                  label="Blood group"
                  icon={<Droplet size={15} />}
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  placeholder="e.g. O+ (optional)"
                  hint="Shown on your emergency card if you add one."
                />
              </div>

              <FormError message={error} />

              <div className="mt-5">
                <PrimaryButton
                  state={savingProfile ? 'loading' : 'idle'}
                  loadingLabel="Saving…"
                  disabled={!fullName.trim()}
                  onClick={handleProfileSetup}
                >
                  Continue to dashboard
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
                <p className="text-[15px] font-semibold text-ink-900">Admin Portal</p>
                <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-ink-500">
                  Staff account verified. Signing you in to the Admin Portal…
                </p>
                <Link
                  to="/admin"
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-purple underline-offset-2 hover:underline"
                >
                  Not redirected? Open Admin Portal
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
 * A labelled <select> matching shared/auth's Field treatment.
 *
 * Kept local to the User Portal on purpose: shared/auth is imported by the
 * doctor and admin portals too, and neither needs this.
 */
function SelectField({
  label,
  icon,
  hint,
  className = '',
  children,
  ...select
}: {
  label: string;
  icon?: ReactNode;
  hint?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = select.id ?? autoId;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}
      </label>

      <div className="group relative flex items-center rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        {icon && (
          <span className="pl-3.5 text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple">
            {icon}
          </span>
        )}
        <select
          {...select}
          id={id}
          className={`w-full bg-transparent py-3 text-sm text-ink-900 outline-none ${
            icon ? 'pl-2.5 pr-3.5' : 'px-3.5'
          }`}
        >
          {children}
        </select>
      </div>

      {hint && <p className="mt-1.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
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
