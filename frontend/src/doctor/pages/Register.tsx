import {
  useId,
  useState,
  type FormEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  FileUp,
  IndianRupee,
  MapPin,
  User,
} from 'lucide-react';
import {
  AuthCard,
  AuthShell,
  Field,
  FormError,
  HealthNowLogo,
  PrimaryButton,
  SecurityBadge,
  StepHeading,
} from '@shared/auth';
import { DEFAULT_COUNTRY, type Country } from '@shared/data/countries';
import BookingPhoneField from '../components/BookingPhoneField';
import { useAuth } from '../context/AuthContext';
import { doctorApi } from '../lib/api';

/**
 * A labelled <textarea> matching shared/auth's Field treatment.
 *
 * Every other control on this form is single-line, but a clinic address is
 * genuinely street + area + city, which wraps awkwardly in a one-line input.
 * Kept local to the Doctor Portal: shared/auth is imported by the patient
 * and admin portals too, and neither needs this.
 */
function TextAreaField({
  label,
  icon,
  hint,
  className = '',
  ...textarea
}: {
  label: string;
  icon?: ReactNode;
  hint?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const id = textarea.id ?? autoId;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}
      </label>

      <div className="group relative flex items-start rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        {icon && (
          <span className="pl-3.5 pt-3 text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple">
            {icon}
          </span>
        )}
        <textarea
          {...textarea}
          id={id}
          className={`w-full resize-none bg-transparent py-3 text-sm text-ink-900 outline-none placeholder:text-ink-300 ${
            icon ? 'pl-2.5 pr-3.5' : 'px-3.5'
          }`}
        />
      </div>

      {hint && <p className="mt-1.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

/** A booking number may be a mobile or a landline, so its length varies. */

export default function Register() {
  const { refreshDoctor } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [bookingCountry, setBookingCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [bookingDigits, setBookingDigits] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // The browser has already enforced every `required` field by the time
    // this runs — a real <form> submit, not a click handler, so an empty
    // required field is blocked natively before any request is made.
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await doctorApi.register({
        // Every screen that shows a doctor's name already prepends "Dr. "
        // itself — but the form's own placeholder ("Dr. Anjali Mehta")
        // invites typing "Dr." too, so without this a name typed
        // as "Dr. Priya Nair" ends up displayed everywhere as
        // "Dr. Dr. Priya Nair". Strip one leading Dr./Dr/DR (with or
        // without a period) so what's stored is always just the plain
        // name.
        full_name: fullName.replace(/^dr(\.\s*|\s+)/i, '').trim(),
        specialization,
        qualification,
        experience_years: Number(experienceYears) || 0,
        clinic_name: clinicName,
        registration_number: registrationNumber,
        clinic_address: clinicAddress,
        booking_phone_number: `${bookingCountry.dialCode}${bookingDigits}`,
        consultation_fee: consultationFee,
        license_document: licenseDocument,
      });
      await refreshDoctor();
      navigate('/doctor');
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError('Your session expired. Redirecting you to sign in again...');
        setTimeout(() => navigate('/doctor/login'), 1800);
      } else {
        // Show the backend's actual validation message when there is one,
        // instead of a generic guess. DRF returns either
        // {"detail": "..."} for a single error, or {"field_name": ["msg"]}
        // for per-field validation — e.g. entering -8 for years of
        // experience returns {"experience_years": ["Ensure this value is
        // greater than or equal to 0."]}, which was previously hidden
        // behind a misleading "check you're logged in" message.
        const data = err?.response?.data;
        let message = 'Could not complete registration. Please check your details and try again.';
        if (data?.detail) {
          message = data.detail;
        } else if (data && typeof data === 'object') {
          const firstField = Object.keys(data)[0];
          const firstMessage = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
          if (firstField && firstMessage) {
            message = `${firstField.replace(/_/g, ' ')}: ${firstMessage}`;
          }
        }
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        <div className="mb-6">
          <HealthNowLogo portal="doctor" />
        </div>

        <StepHeading
          title="Complete your registration"
          subtitle="Your account needs admin approval before you can open patient records."
        />

        <form onSubmit={handleSubmit} noValidate={false}>
        <div className="space-y-3.5">
          <Field
            label="Full name"
            icon={<User size={15} />}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Anjali Mehta"
            autoComplete="name"
            required
          />
          <Field
            label="Specialization"
            icon={<Briefcase size={15} />}
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="Cardiologist"
            required
          />
          <Field
            label="Qualification"
            icon={<Award size={15} />}
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            placeholder="MBBS, MD"
            required
          />
          <Field
            label="Years of experience"
            icon={<CalendarClock size={15} />}
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            type="number"
            min="0"
            placeholder="8"
          />
          <Field
            label="Clinic or hospital"
            icon={<Building2 size={15} />}
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            placeholder="Apollo Clinic"
            required
          />
          <Field
            label="Registration / license number"
            icon={<BadgeCheck size={15} />}
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="MCI-123456"
            hint="Used by our team to verify you against the medical register."
            required
          />
          <TextAreaField
            label="Clinic address"
            icon={<MapPin size={15} />}
            value={clinicAddress}
            onChange={(e) => setClinicAddress(e.target.value)}
            placeholder="12 MG Road, Vijay Nagar, Indore 452010"
            hint="Street, area and city — patients use this to actually find your clinic."
            rows={2}
            maxLength={255}
            required
          />
          <BookingPhoneField
            country={bookingCountry}
            onCountryChange={setBookingCountry}
            digits={bookingDigits}
            onDigitsChange={setBookingDigits}
          />
          <Field
            label="Consultation fee (optional)"
            icon={<IndianRupee size={15} />}
            value={consultationFee}
            onChange={(e) => setConsultationFee(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="500"
          />
          <Field
            label="License document (optional)"
            icon={<FileUp size={15} />}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setLicenseDocument(e.target.files?.[0] ?? null)}
            hint={
              licenseDocument
                ? `Selected: ${licenseDocument.name}`
                : 'A scan or photo speeds up verification. You can add this later.'
            }
          />
        </div>

        <FormError message={error} />

        <div className="mt-5">
          <PrimaryButton state={saving ? 'loading' : 'idle'} loadingLabel="Submitting…" type="submit">
            Submit for verification
          </PrimaryButton>
        </div>
        </form>

        <SecurityBadge />
      </AuthCard>
    </AuthShell>
  );
}
