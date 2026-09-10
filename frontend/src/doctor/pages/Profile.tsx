import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  FileUp,
  IndianRupee,
  MapPin,
  ShieldAlert,
  Smartphone,
  User,
} from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button, Badge } from '../components/ui';
import BookingPhoneField from '../components/BookingPhoneField';
import { DAY_NAMES } from '../components/ClinicAvailability';
import { authApi, doctorApi, profileApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from '@shared/data/countries';

type Doctor = {
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  clinic_name: string;
  clinic_address: string;
  registration_number: string;
  booking_phone_number: string;
  consultation_fee: string | null;
  license_document: string | null;
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
  verification_status: string;
};

/**
 * Splits a stored "+919876543210" back into country + national digits so the
 * shared BookingPhoneField can be pre-filled instead of starting blank and
 * silently discarding the number already on file.
 */
function splitPhone(stored: string): { country: Country; digits: string } {
  const cleaned = (stored || '').replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    // Longest dial code first, so a short code never shadows a longer one
    // that starts with the same digits.
    const match = [...COUNTRIES]
      .sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((c) => cleaned.startsWith(c.dialCode));
    if (match) return { country: match, digits: cleaned.slice(match.dialCode.length) };
  }
  return { country: DEFAULT_COUNTRY, digits: cleaned.replace(/^\+/, '') };
}

const inputClass =
  'w-full text-sm px-3 py-2 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30';

function Row({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-700">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

export default function Profile() {
  const { refreshDoctor } = useAuth();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loginNumber, setLoginNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reverified, setReverified] = useState(false);

  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [originalRegistration, setOriginalRegistration] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState('');
  const [fee, setFee] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  function hydrate(d: Doctor) {
    setDoctor(d);
    setFullName(d.full_name ?? '');
    setSpecialization(d.specialization ?? '');
    setQualification(d.qualification ?? '');
    setExperienceYears(String(d.experience_years ?? 0));
    setClinicName(d.clinic_name ?? '');
    setClinicAddress(d.clinic_address ?? '');
    setRegistrationNumber(d.registration_number ?? '');
    setOriginalRegistration(d.registration_number ?? '');
    const phone = splitPhone(d.booking_phone_number ?? '');
    setCountry(phone.country);
    setDigits(phone.digits);
    setFee(d.consultation_fee ?? '');
    setDays(d.available_days ?? []);
    // The API returns "09:00:00"; <input type="time"> wants "09:00".
    setOpenTime((d.clinic_open_time ?? '').slice(0, 5));
    setCloseTime((d.clinic_close_time ?? '').slice(0, 5));
  }

  useEffect(() => {
    doctorApi.me().then((r) => hydrate(r.data));
    authApi.me().then((r) => setLoginNumber(r.data.phone_number ?? ''));
  }, []);

  const registrationChanged = registrationNumber.trim() !== originalRegistration.trim();
  const timesInvalid = !!openTime && !!closeTime && openTime >= closeTime;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setReverified(false);
    setSaving(true);
    try {
      const form = new FormData();
      form.append('full_name', fullName);
      form.append('specialization', specialization);
      form.append('qualification', qualification);
      form.append('experience_years', String(Number(experienceYears) || 0));
      form.append('clinic_name', clinicName);
      form.append('clinic_address', clinicAddress);
      form.append('registration_number', registrationNumber);
      form.append('booking_phone_number', `${country.dialCode}${digits}`);
      // A JSON list inside multipart has to be stringified; DRF's JSONField
      // parses it back on the other side.
      form.append('available_days', JSON.stringify(days));
      if (fee) form.append('consultation_fee', fee);
      if (openTime) form.append('clinic_open_time', openTime);
      if (closeTime) form.append('clinic_close_time', closeTime);
      if (licenseFile) form.append('license_document', licenseFile);

      const { data } = await profileApi.update(form);
      hydrate(data);
      setLicenseFile(null);
      setSaved(true);
      // The backend decides whether re-verification happened; this only
      // reports what came back rather than predicting it.
      if (registrationChanged && data.verification_status === 'pending') setReverified(true);
      await refreshDoctor();
    } catch (err: any) {
      const body = err?.response?.data;
      const first = body && typeof body === 'object' ? Object.entries(body)[0] : null;
      setError(
        first
          ? `${String(first[0]).replace(/_/g, ' ')}: ${
              Array.isArray(first[1]) ? first[1][0] : String(first[1])
            }`
          : 'Could not save your profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (!doctor) {
    return (
      <>
        <Topbar title="My Profile" />
        <main className="p-8 text-sm text-ink-500">Loading...</main>
      </>
    );
  }

  const statusTone =
    doctor.verification_status === 'verified'
      ? 'success'
      : doctor.verification_status === 'rejected'
        ? 'danger'
        : 'warning';

  return (
    <>
      <Topbar title="My Profile" subtitle="Your details as patients and admins see them" />
      <main className="p-8">
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
          {saved && (
            <Card className="p-4">
              <p className="text-sm font-medium text-success flex items-center gap-1.5">
                <Check size={15} /> Profile saved.
              </p>
              {reverified && (
                <p className="mt-1.5 text-xs text-ink-700">
                  Your registration number changed, so your account has been set back to{' '}
                  <strong>pending</strong> and returned to the admin verification queue. Patients
                  will not see you in Find Care until an admin approves the new number.
                </p>
              )}
            </Card>
          )}
          {error && (
            <Card className="p-4">
              <p className="text-sm text-danger">{error}</p>
            </Card>
          )}

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">Professional details</p>
              <Badge tone={statusTone}>{doctor.verification_status}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Row label="Full name" icon={<User size={13} />}>
                <input
                  className={inputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </Row>
              <Row label="Specialization" icon={<Briefcase size={13} />}>
                <input
                  className={inputClass}
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  required
                />
              </Row>
              <Row label="Qualification" icon={<Award size={13} />}>
                <input
                  className={inputClass}
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                />
              </Row>
              <Row label="Years of experience" icon={<CalendarClock size={13} />}>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                />
              </Row>
            </div>

            <Row label="Registration / license number" icon={<BadgeCheck size={13} />}>
              <input
                className={inputClass}
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                required
              />
              {registrationChanged && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-warning">
                  <ShieldAlert size={13} className="mt-px shrink-0" />
                  Changing this returns your account to the admin verification queue — an admin
                  approved the current number, so a new one has to be checked before you appear in
                  Find Care again.
                </p>
              )}
            </Row>
          </Card>

          <Card className="p-5 space-y-4">
            <p className="text-sm font-semibold text-ink-900">Clinic &amp; contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Row label="Clinic or hospital" icon={<Building2 size={13} />}>
                <input
                  className={inputClass}
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </Row>
              <Row label="Consultation fee" icon={<IndianRupee size={13} />}>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="500"
                />
              </Row>
            </div>

            <Row label="Clinic address" icon={<MapPin size={13} />}>
              <textarea
                className={`${inputClass} resize-none`}
                rows={2}
                maxLength={255}
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
              />
            </Row>

            <BookingPhoneField
              country={country}
              onCountryChange={setCountry}
              digits={digits}
              onDigitsChange={setDigits}
            />

            {/* Read-only on purpose: this is the OTP login credential, not a
                profile detail. Changing it is a sign-in change and is
                explicitly out of scope here. */}
            <Row label="Login number (account)" icon={<Smartphone size={13} />}>
              <input
                className={`${inputClass} bg-surface text-ink-500`}
                value={loginNumber}
                readOnly
                disabled
              />
              <p className="mt-1.5 text-[11px] text-ink-500">
                Used to sign in. Never shown to patients, and not editable here.
              </p>
            </Row>
          </Card>

          <Card className="p-5 space-y-4">
            <p className="text-sm font-semibold text-ink-900">Availability</p>
            <div>
              <p className="text-xs font-semibold text-ink-700 mb-2">Available days</p>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((d) => {
                  const on = days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]))
                      }
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        on
                          ? 'bg-brand-purple text-white border-brand-purple'
                          : 'bg-card text-ink-500 border-border hover:border-brand-purple'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Row label="Opens at">
                <input
                  className={inputClass}
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                />
              </Row>
              <Row label="Closes at">
                <input
                  className={inputClass}
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </Row>
            </div>
            {timesInvalid && (
              <p className="text-xs text-danger">Closing time must be after opening time.</p>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <p className="text-sm font-semibold text-ink-900">License document</p>
            {doctor.license_document ? (
              <a
                href={doctor.license_document}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-purple hover:underline"
              >
                View current document →
              </a>
            ) : (
              <p className="text-xs text-ink-300">No document uploaded yet.</p>
            )}
            <Row label="Replace document" icon={<FileUp size={13} />}>
              <input
                className={inputClass}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
              />
              {licenseFile && (
                <p className="mt-1.5 text-[11px] text-ink-500">Selected: {licenseFile.name}</p>
              )}
            </Row>
          </Card>

          <Button type="submit" disabled={saving || timesInvalid}>
            <Check size={15} /> {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </main>
    </>
  );
}
