import { useEffect, useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { CalendarDays, Droplet, KeyRound, User, Users } from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  CuraPathLogo,
  Field,
  FormError,
  OTPInput,
  OtpStep,
  PIN_LENGTH,
  PrimaryButton,
  SecurityBadge,
  Step,
  StepHeading,
  SuccessOverlay,
} from '@shared/auth';
import SessionStatus from '../../auth/SessionStatus';
import { useAuth } from '../context/AuthContext';
import { profilesApi } from '../lib/api';
import { BLOOD_GROUPS } from '@shared/bloodGroups';
import { usePin } from '@shared/session/PinContext';
import { needsOtp, pinErrorMessage } from '@shared/session/mpinApi';

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

/**
 * /patient/setup — the person's own profile, the mobile app's profile-setup
 * screen on the web.
 *
 * Every record hangs off a profile, so User mode has nothing to show until
 * one exists. A brand-new account comes here straight from sign-in, and so
 * does a doctor who registered without one the first time they switch to
 * User mode.
 *
 * For a new account this is the registration page: the details and the
 * 4-digit PIN (typed twice) on one screen. The PIN is saved first — it is
 * how they sign in from then on — and the profile straight after.
 */
export default function ProfileSetup() {
  const { isLoading, isAuthenticated, loadFailed, account, profiles, refreshProfiles } = useAuth();
  const pin = usePin();
  const navigate = useNavigate();

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaved, setPinSaved] = useState(false);
  /** The server wants a fresh code before it will set the PIN (sign-in too long ago). */
  const [reverify, setReverify] = useState(false);
  // Strictly false: an account whose PIN state is unknown is not asked.
  const askPin = pinSaved || account?.has_mpin === false;

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate('/patient', { replace: true }), SUCCESS_HOLD_MS);
    return () => clearTimeout(id);
  }, [done, navigate]);

  if (isLoading || loadFailed) return <SessionStatus />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: '/patient/setup' }} />;
  // Already has a profile (and not because this form just made it).
  if (profiles.length > 0 && !done && !saving) return <Navigate to="/patient" replace />;

  async function handleSave(grant?: string) {
    setError(null);
    if (askPin && !pinSaved) {
      if (newPin.length !== PIN_LENGTH) {
        setError('Choose a 4-digit PIN.');
        return;
      }
      if (newPin !== confirmPin) {
        setError('The two PINs do not match. Please type the confirmation again.');
        setConfirmPin('');
        return;
      }
    }
    setSaving(true);
    try {
      if (askPin && !pinSaved) {
        try {
          await pin.setPin(newPin, grant);
          setPinSaved(true);
        } catch (err) {
          if (needsOtp(err)) {
            setReverify(true);
            return;
          }
          setError(pinErrorMessage(err, 'Could not set your PIN. Please try again.'));
          return;
        }
      }
      // Age is deliberately absent here. It's derived from date_of_birth
      // for display only — storing it would be wrong the day after signup.
      await profilesApi.create({
        full_name: fullName.trim(),
        relation: 'self',
        blood_group: bloodGroup,
        date_of_birth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      setDone(true);
      await refreshProfiles();
    } catch {
      setError('Could not save your profile. Please try again.');
      setDone(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        <AnimatePresence>
          {done && <SuccessOverlay title="You're all set" subtitle="Taking you to your dashboard…" />}
        </AnimatePresence>

        <div className="mb-6">
          <CuraPathLogo portal="patient" />
        </div>

        {reverify && account && (
          <Step key="reverify">
            <OtpStep
              phone={account.phone_number}
              onVerified={async (data) => {
                setReverify(false);
                await handleSave(data.grant);
              }}
            />
          </Step>
        )}

        {!reverify && (
        <Step key="profile">
          <StepHeading
            title={askPin ? 'Create your account' : 'Complete your profile'}
            subtitle={
              askPin
                ? 'Your details, and a 4-digit PIN you will use to sign in.'
                : 'Just the basics — you can add more later in Settings.'
            }
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
            <SelectField label="Gender" icon={<Users size={15} />} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select (optional)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </SelectField>
            <SelectField
              label="Blood group"
              icon={<Droplet size={15} />}
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              hint="Shown on your emergency card if you add one."
            >
              <option value="">Select (optional)</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </SelectField>
          </div>

          {askPin && (
            <div className="mt-5 border-t border-border/70 pt-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-700">
                <KeyRound size={14} className="text-brand-purple" /> Set your 4-digit PIN
              </p>
              <p className="mb-2.5 text-[11px] text-ink-500">
                You will sign in with your number and this PIN on any device.
              </p>
              {pinSaved ? (
                <p className="text-[12px] font-medium text-success">PIN saved.</p>
              ) : (
                <>
                  <div className="max-w-[248px]">
                    <OTPInput
                      value={newPin}
                      onChange={(v) => {
                        setNewPin(v);
                        if (error) setError(null);
                      }}
                      length={PIN_LENGTH}
                      masked
                      label="New PIN"
                      disabled={saving}
                    />
                  </div>
                  <p className="mb-2.5 mt-3.5 text-xs font-semibold text-ink-700">Confirm PIN</p>
                  <div className="max-w-[248px]">
                    <OTPInput
                      value={confirmPin}
                      onChange={(v) => {
                        setConfirmPin(v);
                        if (error) setError(null);
                      }}
                      length={PIN_LENGTH}
                      masked
                      label="Confirm PIN"
                      disabled={saving}
                      invalid={confirmPin.length === PIN_LENGTH && confirmPin !== newPin}
                    />
                  </div>
                  {confirmPin.length === PIN_LENGTH && confirmPin !== newPin && (
                    <p className="mt-1.5 text-[11px] text-danger">The PINs do not match.</p>
                  )}
                </>
              )}
            </div>
          )}

          <FormError message={error} />

          <div className="mt-5">
            <PrimaryButton
              state={saving ? 'loading' : 'idle'}
              loadingLabel="Saving…"
              disabled={
                !fullName.trim() ||
                (askPin && !pinSaved && (newPin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH))
              }
              onClick={() => handleSave()}
            >
              {askPin ? 'Create account' : 'Continue to dashboard'}
            </PrimaryButton>
          </div>

          <SecurityBadge />
        </Step>
        )}
      </AuthCard>
    </AuthShell>
  );
}

/** A labelled <select> matching shared/auth's Field treatment. */
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
          className={`w-full bg-transparent py-3 text-sm text-ink-900 outline-none ${icon ? 'pl-2.5 pr-3.5' : 'px-3.5'}`}
        >
          {children}
        </select>
      </div>

      {hint && <p className="mt-1.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
