import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Button, Card } from '../components/ui';
import { accessApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function RequestAccess() {
  const { doctor } = useAuth();
  const navigate = useNavigate();
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!doctor) return;
    setError('');
    setLoading(true);
    try {
      await accessApi.request(doctor.id, profileId);
      setSuccess(true);
      setTimeout(() => navigate('/doctor'), 1500);
    } catch {
      setError(
        "Could not send the request. Double-check the patient's reference ID — it must be a valid profile ID."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Topbar title="Request Patient Access" subtitle="Ask a patient for consent to view their records" />
      <main className="p-8">
        <Card className="p-6 max-w-md">
          <div className="w-11 h-11 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center mb-4">
            <UserPlus size={20} />
          </div>
          <p className="text-sm text-ink-500 mb-4">
            Enter the patient's reference ID (they can find this in their app's profile). They'll need to
            approve your request before you can see anything — you won't have access until they do.
          </p>
          <input
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="Patient reference ID"
            className="w-full text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 mb-3"
          />
          {error && <p className="text-xs text-danger mb-3">{error}</p>}
          {success && <p className="text-xs text-success mb-3">Request sent — waiting on the patient now.</p>}
          <Button onClick={handleSubmit} disabled={loading || !profileId.trim()}>
            {loading ? 'Sending...' : 'Send Request'}
          </Button>
        </Card>
      </main>
    </>
  );
}
