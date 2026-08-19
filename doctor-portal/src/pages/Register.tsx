import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { doctorApi } from '../lib/api';
import { Button, Card } from '../components/ui';

export default function Register() {
  const { refreshDoctor } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    setSaving(true);
    try {
      await doctorApi.register({
        // Every screen that shows a doctor's name already prepends "Dr. "
        // itself — but the form's own placeholder ("e.g. Dr. Anjali
        // Mehta") invites typing "Dr." too, so without this a name typed
        // as "Dr. Priya Nair" ends up displayed everywhere as
        // "Dr. Dr. Priya Nair". Strip one leading Dr./Dr/DR (with or
        // without a period) so what's stored is always just the plain
        // name.
        full_name: fullName.replace(/^dr(\.\s*|\s+)/i, '').trim(),
        specialization,
        qualification,
        experience_years: Number(experienceYears) || 0,
        clinic_name: clinicName,
      });
      await refreshDoctor();
      navigate('/');
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError('Your session expired. Redirecting you to log in again...');
        setTimeout(() => navigate('/login'), 1800);
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
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center justify-center mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-teal to-brand-purple flex items-center justify-center text-white">
            <Stethoscope size={22} />
          </div>
        </div>
        <p className="font-bold text-ink-900 text-lg text-center mt-2">Doctor Registration</p>
        <p className="text-xs text-ink-500 text-center mb-6">
          Your account will need admin approval before you can access patient records.
        </p>

        <div className="space-y-3">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name (e.g. Dr. Anjali Mehta)"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
          <input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="Specialization (e.g. Cardiologist)"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
          <input
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            placeholder="Qualification (e.g. MBBS, MD)"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
          <input
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            type="number"
            min="0"
            placeholder="Years of experience"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
          <input
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            placeholder="Clinic / hospital name (optional)"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>

        {error && <p className="text-xs text-danger mt-3">{error}</p>}

        <Button
          className="w-full justify-center mt-5"
          onClick={handleSubmit}
          disabled={saving || !fullName || !specialization || !qualification}
        >
          {saving ? 'Submitting...' : 'Submit for Verification'}
        </Button>
      </Card>
    </div>
  );
}
