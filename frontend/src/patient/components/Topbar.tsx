import { type ReactNode, useRef, useState } from 'react';
import { Bell, ChevronDown, Plus, UserPlus, X, Phone, CheckCircle, Clock, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button } from './ui';
import { MobileMenuButton } from '@shared/layout/ResponsiveShell';
import ModeSwitch from '@shared/session/ModeSwitch';
import AmbientBackground from '@shared/components/AmbientBackground';
import useClickOutside from '@shared/useClickOutside';
import { todayIso } from '@shared/dates';
import useNotifications from '../hooks/useNotifications';
import { useAuth } from '../context/AuthContext';
import { allergiesApi, familyApi } from '../lib/api';
import { useBackToClose } from '@shared/hooks/useBackToClose';

/** Straight from Profile.Relation on the model, minus `self`: the account
 *  holder already exists, so a new member is always someone else. */
const RELATIONS = [
  ['father', 'Father'],
  ['mother', 'Mother'],
  ['spouse', 'Spouse'],
  ['son', 'Son'],
  ['daughter', 'Daughter'],
  ['other', 'Other'],
];

/** Profile.Gender, in full — Settings omits `prefer_not_to_say`, which the
 *  model does offer, so this form is the one that matches the data. */
const GENDERS = [
  ['male', 'Male'],
  ['female', 'Female'],
  ['other', 'Other'],
  ['prefer_not_to_say', 'Prefer not to say'],
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Matches the language list already offered on the Settings profile form. */
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali'];

/** AllergyRecord.Kind. */
const ALLERGY_KINDS = [
  ['drug', 'Drug'],
  ['food', 'Food'],
  ['environmental', 'Environmental'],
  ['other', 'Other'],
];

type AllergyDraft = { kind: string; substance: string; reaction: string };

const FIELD =
  'w-full text-sm px-3 py-2 rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30';

export default function Topbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { profiles, activeProfile, setActiveProfile, refreshProfiles, hasRegistered } = useAuth();
  const navigate = useNavigate();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  // The trigger button lives inside this ref too, so pressing it to close
  // does not also fire the outside handler and reopen it.
  useClickOutside(switcherRef, switcherOpen, () => setSwitcherOpen(false));

  const [addOpen, setAddOpen] = useState(false);

  const notifications = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useClickOutside(notifRef, notifOpen, () => setNotifOpen(false));

  /** Switching and viewing are the same gesture: the row you pick becomes
   *  the active profile AND opens its full details, which is what people
   *  expect from a name they just clicked. */
  function openProfile(id: string) {
    const picked = profiles.find((p) => p.id === id);
    if (picked) setActiveProfile(picked);
    setSwitcherOpen(false);
    // Already on Settings: swap in place, so Back is not a dead step.
    navigate('/patient/settings', { replace: window.location.pathname === '/patient/settings' });
  }

  return (
    <>
      <header className="relative sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-3 lg:flex-nowrap lg:gap-x-4">
        {/* Header-variant ambient art: 3 small icons, far right, so it
            never sits under the page title itself.

            Deliberately NOT `overflow-hidden` on this header. That was here
            to keep the ambient art's oversized icons from widening the page,
            but AmbientBackground is inset-0 and already clips its own
            children — so the rule was redundant, and it cropped the profile
            menu below to the header's 83px, leaving a ~12px sliver that read
            as "clicking does nothing". Anything absolutely positioned from
            this header must be free to extend past it. */}
        <AmbientBackground variant="header" />
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <MobileMenuButton />
          <div className="min-w-0">
            <h1 className="truncate text-base sm:text-lg lg:text-xl font-bold text-ink-900">{title}</h1>
            {subtitle && <p className="hidden sm:block truncate text-sm text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {/* Below `lg` (phones, tablets — wherever the menu is a drawer): a
            second row for the User / Doctor switch and the page's own button.
            On one row they left the title a few letters ("M…", "We…"). From
            `lg` up this row joins the first. The doctor header
            (doctor/components/Topbar.tsx) does the same, so the switch sits
            in the same place in both modes. */}
        {(action || hasRegistered) && (
          <div className="relative order-last flex w-full flex-wrap items-center gap-2 lg:order-none lg:w-auto">
            <ModeSwitch labels className="lg:hidden" />
            {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
          </div>
        )}

        <div className="relative flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-4">
          {/* User / Doctor switch — only once this account has registered
              as a doctor; renders nothing before that. Below `lg` it is the
              labelled one in the second row. */}
          <ModeSwitch className="hidden lg:inline-flex" />

          {/* The real bell, on every screen. It used to be the Dashboard's
              alone, passed in through `action`, while this header rendered a
              second permanently disabled one — so the Dashboard showed two
              bells and every other page showed a dead one. The trigger sits
              inside notifRef so pressing it to close is not also counted as
              an outside press, which would close and reopen it. */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={
                notifications.length
                  ? `Notifications, ${notifications.length} unread`
                  : 'Notifications'
              }
              className="relative w-10 h-10 rounded-full flex items-center justify-center text-ink-700 hover:bg-surface transition-colors"
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-danger" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-card py-2 z-20">
                <p className="px-3 pb-1 text-xs font-semibold text-ink-500 uppercase tracking-wide">Notifications</p>
                {notifications.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-ink-500">You're all caught up.</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="px-3 py-2 text-sm text-ink-700 flex items-start gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.tone === 'warning' ? 'bg-warning' : 'bg-info'}`} />
                      {n.text}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              aria-label={`Switch profile — viewing ${activeProfile?.full_name ?? '…'}`}
              aria-expanded={switcherOpen}
              className="flex items-center gap-2.5 p-1 sm:pr-2 rounded-full hover:bg-surface transition-colors"
            >
              <Avatar initials={activeProfile?.initials || '?'} />
              <div className="text-left hidden xl:block">
                <p className="max-w-[12rem] truncate text-sm font-semibold text-ink-900 leading-tight">{activeProfile?.full_name || 'Loading...'}</p>
                <p className="text-xs text-ink-500 leading-tight capitalize">{activeProfile?.relation}</p>
              </div>
              <ChevronDown size={16} className="hidden sm:block text-ink-500" />
            </button>

            {switcherOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-card py-2 z-20">
                <p className="px-3 pb-1 text-xs font-semibold text-ink-500 uppercase tracking-wide">Switch profile</p>
                {profiles.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openProfile(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface text-left"
                  >
                    <Avatar initials={m.initials} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{m.full_name}</p>
                      <p className="text-xs text-ink-500 capitalize">
                        {m.relation}
                        {m.id === activeProfile?.id && ' · viewing'}
                      </p>
                    </div>
                  </button>
                ))}

                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => {
                      setSwitcherOpen(false);
                      setAddOpen(true);
                    }}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm font-medium text-accent-ink hover:bg-surface"
                  >
                    <Plus size={15} /> Add family member
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {addOpen && (
        <AddFamilyMemberModal
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            await refreshProfiles();
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}

type Step = 'details' | 'otp' | 'done';

function AddFamilyMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  useBackToClose(true, onClose);
  const [step, setStep] = useState<Step>('details');

  const [fullName, setFullName] = useState('');
  const [relation, setRelation] = useState('father');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [language, setLanguage] = useState('English');
  const [allergies, setAllergies] = useState<AllergyDraft[]>([]);

  const isChild = (relation === 'son' || relation === 'daughter') &&
    (dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : !age || Number(age) < 18);
  const phoneRequired = !isChild && relation !== 'self';

  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [hasExistingAccount, setHasExistingAccount] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateAllergy(i: number, patch: Partial<AllergyDraft>) {
    setAllergies((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function ageToDob(ageYears: number): string {
    const year = new Date().getFullYear() - ageYears;
    return `${year}-01-01`;
  }

  async function handleSendOtp() {
    if (phoneRequired && !phoneNumber.trim()) {
      setError('Phone number is required for adult family members.');
      return;
    }
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (age && (!/^\d+$/.test(age) || Number(age) > 130)) {
      setError('Age must be a whole number between 0 and 130.');
      return;
    }
    setError('');

    if (!phoneNumber.trim()) {
      await handleCreateMember();
      return;
    }

    setOtpSending(true);
    try {
      const { data } = await familyApi.verifyPhone(phoneNumber.trim());
      if (!data.ok) {
        setError(data.error || 'Could not send OTP.');
        setOtpSending(false);
        return;
      }
      setHasExistingAccount(data.has_existing_account);
      setStep('otp');
    } catch {
      setError('Could not send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) return;
    setError('');
    setOtpVerifying(true);
    try {
      const { data } = await familyApi.confirmPhone(phoneNumber.trim(), otp.trim());
      if (!data.verified) {
        const msgs: Record<string, string> = {
          wrong: 'Incorrect OTP. Please try again.',
          expired: 'OTP expired. Please request a new one.',
          locked: 'Too many attempts. Please request a new OTP.',
        };
        setError(msgs[data.result] || 'Verification failed.');
        setOtpVerifying(false);
        return;
      }
      await handleCreateMember();
    } catch {
      setError('Verification failed. Please try again.');
      setOtpVerifying(false);
    }
  }

  async function handleCreateMember() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        relation,
        ...(dob ? { date_of_birth: dob } : age ? { date_of_birth: ageToDob(Number(age)) } : {}),
        ...(gender ? { gender } : {}),
        ...(bloodGroup ? { blood_group: bloodGroup } : {}),
        ...(phoneNumber.trim() ? { phone_number: phoneNumber.trim() } : {}),
        ...(heightCm ? { height_cm: Number(heightCm) } : {}),
        ...(weightKg ? { weight_kg: Number(weightKg) } : {}),
        preferred_language: language,
      };
      const { data } = await familyApi.createMember(payload);

      if (data.status === 'pending_approval') {
        setPendingApproval(true);
        setStep('done');
        return;
      }

      for (const a of allergies) {
        if (!a.substance.trim()) continue;
        await allergiesApi.create({
          profile: data.id,
          kind: a.kind,
          substance: a.substance.trim(),
          reaction: a.reaction.trim(),
        });
      }
      await onCreated();
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } })?.response?.data;
      const first = detail && Object.values(detail)[0];
      setError(Array.isArray(first) ? first[0] : (typeof first === 'string' ? first : '') || 'Could not add this family member. Please try again.');
      setSaving(false);
      setOtpVerifying(false);
    }
  }

  async function handleResendOtp() {
    setOtp('');
    setError('');
    setOtpSending(true);
    try {
      const { data } = await familyApi.verifyPhone(phoneNumber.trim());
      if (!data.ok) setError(data.error || 'Could not resend OTP.');
    } catch {
      setError('Could not resend OTP.');
    } finally {
      setOtpSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add family member"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 'otp' ? <Phone size={18} className="text-accent-ink" /> :
             step === 'done' ? <CheckCircle size={18} className="text-success" /> :
             <UserPlus size={18} className="text-accent-ink" />}
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {step === 'details' && 'Add family member'}
                {step === 'otp' && 'Verify phone number'}
                {step === 'done' && (pendingApproval ? 'Approval requested' : 'Member added')}
              </p>
              <p className="text-xs text-ink-500">
                {step === 'details' && 'Their records stay separate from yours.'}
                {step === 'otp' && `Enter the OTP sent to ${phoneNumber}`}
                {step === 'done' && pendingApproval && 'Waiting for the account holder to approve.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-500 hover:bg-surface">
            <X size={18} />
          </button>
        </div>

        {step === 'details' && (
          <>
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="fm-name" className="mb-1 block text-[11px] font-semibold text-ink-700">
                    Full name <span className="text-danger">*</span>
                  </label>
                  <input id="fm-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className={FIELD} />
                </div>
                <div>
                  <label htmlFor="fm-relation" className="mb-1 block text-[11px] font-semibold text-ink-700">
                    Relation <span className="text-danger">*</span>
                  </label>
                  <select id="fm-relation" value={relation} onChange={(e) => setRelation(e.target.value)} className={FIELD}>
                    {RELATIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="fm-phone" className="mb-1 block text-[11px] font-semibold text-ink-700">
                    Phone number {phoneRequired ? <span className="text-danger">*</span> : isChild && <span className="text-ink-400 font-normal">(optional)</span>}
                  </label>
                  <input id="fm-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. 9876543210" className={FIELD} />
                </div>
                <div>
                  <label htmlFor="fm-dob" className="mb-1 block text-[11px] font-semibold text-ink-700">Date of birth (or enter age below)</label>
                  <input id="fm-dob" type="date" max={todayIso()} value={dob} onChange={(e) => setDob(e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label htmlFor="fm-age" className="mb-1 block text-[11px] font-semibold text-ink-700">Age (years)</label>
                  <input id="fm-age" type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 45" className={FIELD} />
                </div>
                <div>
                  <label htmlFor="fm-gender" className="mb-1 block text-[11px] font-semibold text-ink-700">Gender</label>
                  <select id="fm-gender" value={gender} onChange={(e) => setGender(e.target.value)} className={FIELD}>
                    <option value="">Not specified</option>
                    {GENDERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="fm-blood" className="mb-1 block text-[11px] font-semibold text-ink-700">Blood group</label>
                  <select id="fm-blood" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className={FIELD}>
                    <option value="">Not known</option>
                    {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="fm-height" className="mb-1 block text-[11px] font-semibold text-ink-700">Height (cm)</label>
                  <input id="fm-height" type="number" min={1} max={300} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="170" className={FIELD} />
                </div>
                <div>
                  <label htmlFor="fm-weight" className="mb-1 block text-[11px] font-semibold text-ink-700">Weight (kg)</label>
                  <input id="fm-weight" type="number" min={1} max={500} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="65" className={FIELD} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="fm-lang" className="mb-1 block text-[11px] font-semibold text-ink-700">Preferred language</label>
                  <select id="fm-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className={FIELD}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Allergies</p>
                  <button onClick={() => setAllergies((l) => [...l, { kind: 'drug', substance: '', reaction: '' }])} className="flex items-center gap-1 text-xs font-medium text-accent-ink">
                    <Plus size={13} /> Add allergy
                  </button>
                </div>
                {allergies.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-500">None recorded. You can add these later too.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {allergies.map((a, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_1fr_auto] gap-2">
                        <select value={a.kind} onChange={(e) => updateAllergy(i, { kind: e.target.value })} className={FIELD} aria-label={`Allergy ${i + 1} type`}>
                          {ALLERGY_KINDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                        <input value={a.substance} onChange={(e) => updateAllergy(i, { substance: e.target.value })} placeholder="Substance" aria-label={`Allergy ${i + 1} substance`} className={FIELD} />
                        <input value={a.reaction} onChange={(e) => updateAllergy(i, { reaction: e.target.value })} placeholder="Reaction (optional)" aria-label={`Allergy ${i + 1} reaction`} className={FIELD} />
                        <button onClick={() => setAllergies((l) => l.filter((_, idx) => idx !== i))} aria-label={`Remove allergy ${i + 1}`} className="rounded-lg px-2 text-ink-500 hover:bg-surface">
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="ghost" onClick={onClose} disabled={saving || otpSending}>Cancel</Button>
              <Button onClick={handleSendOtp} disabled={saving || otpSending || !fullName.trim()}>
                {otpSending ? 'Sending OTP...' : phoneNumber.trim() ? 'Verify & Add' : 'Add member'}
              </Button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-surface p-4">
              <Shield size={24} className="text-accent-ink shrink-0" />
              <div>
                <p className="text-sm font-medium text-ink-900">OTP sent to {phoneNumber}</p>
                <p className="text-xs text-ink-500">
                  {hasExistingAccount
                    ? 'This number belongs to an existing user. After verification, an approval request will be sent to them.'
                    : 'Enter the 6-digit code to verify this phone number.'}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="fm-otp" className="mb-1 block text-[11px] font-semibold text-ink-700">Enter OTP</label>
              <input
                id="fm-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className={`${FIELD} text-center text-lg tracking-[0.3em]`}
                autoFocus
              />
            </div>

            <button onClick={handleResendOtp} disabled={otpSending} className="text-xs text-accent-ink hover:underline disabled:opacity-50">
              {otpSending ? 'Sending...' : 'Resend OTP'}
            </button>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setStep('details'); setError(''); }} disabled={otpVerifying}>Back</Button>
              <Button onClick={handleVerifyOtp} disabled={otpVerifying || otp.length < 6} className="flex-1">
                {otpVerifying || saving ? 'Verifying...' : 'Verify & Continue'}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && pendingApproval && (
          <div className="px-5 py-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock size={28} className="text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">Approval request sent</p>
              <p className="text-xs text-ink-500 mt-1">
                The owner of {phoneNumber} needs to approve your request.
                Once approved, they'll appear in your family members.
              </p>
            </div>
            <Button onClick={onClose} className="mx-auto">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
