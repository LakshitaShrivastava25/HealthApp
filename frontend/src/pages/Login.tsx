import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { profilesApi } from '../lib/api';
import { Button, Card } from '../components/ui';
import PhoneInput, { usePhoneInput } from '../components/PhoneInput';

type Step = 'phone' | 'otp' | 'profile-setup' | 'staff-redirect';

const STAFF_ROLES = ['admin', 'ocr_reviewer', 'claims_ops'];
const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_PORTAL_URL || 'http://localhost:5174';

export default function Login() {
  const { sendOtp, verifyOtp, refreshProfiles, logout } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('phone');
  const { country, setCountry, digits, setDigits, isComplete, fullNumber, reset: resetPhone } = usePhoneInput();
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  async function handleSendOtp() {
    setError('');
    setLoading(true);
    try {
      const result = await sendOtp(fullNumber);
      setDebugOtp(result.debug_otp ?? null); // only present when backend DEBUG=True — dev convenience
      setStep('otp');
    } catch {
      setError('Could not send OTP. Check the phone number and that the backend is running.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError('');
    setLoading(true);
    try {
      const role = await verifyOtp(fullNumber, otp);
      if (role && STAFF_ROLES.includes(role)) {
        // This phone number belongs to a staff account — it has no
        // business in the patient app. The User Portal and Admin Portal
        // are genuinely separate applications (different origins), so
        // this can only hand off by sending the browser there; it can't
        // silently carry the session across, which is why a second real
        // OTP prompt happens in the Admin Portal itself. That's an
        // honest limitation, not hidden from the person mid-flow.
        //
        // logout() here matters: verifyOtp already set valid tokens for
        // this User Portal session before this check ran. Without
        // clearing them, hitting Back after landing on the Admin Portal
        // would drop the person back into an already-"logged in" User
        // Portal, holding a staff account's session in the wrong app.
        logout();
        setStep('staff-redirect');
        setTimeout(() => {
          window.location.href = ADMIN_PORTAL_URL;
        }, 1800);
        return;
      }
      await refreshProfiles();
      // refreshProfiles updates context asynchronously — check directly via API
      // to decide whether this is a brand-new account needing profile setup.
      const { data } = await profilesApi.list();
      const list = data.results ?? data;
      if (list.length === 0) {
        setStep('profile-setup');
      } else {
        navigate('/');
      }
    } catch {
      setError('Invalid or expired OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSetup() {
    setError('');
    setLoading(true);
    try {
      await profilesApi.create({ full_name: fullName, relation: 'self', blood_group: bloodGroup });
      await refreshProfiles();
      navigate('/');
    } catch {
      setError('Could not save your profile. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-lg bg-brand-teal flex items-center justify-center text-white">
            <HeartPulse size={18} strokeWidth={2.5} />
          </div>
          <p className="font-bold text-ink-900 text-lg">HealthNow</p>
        </div>

        {step === 'phone' && (
          <>
            <p className="text-sm font-semibold text-ink-900 mb-1">Enter your phone number</p>
            <p className="text-xs text-ink-500 mb-4">We'll send you a one-time code.</p>
            <div className="mb-4">
              <PhoneInput country={country} onCountryChange={setCountry} digits={digits} onDigitsChange={setDigits} />
            </div>
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <Button className="w-full justify-center" onClick={handleSendOtp} disabled={loading || !isComplete}>
              {loading ? 'Sending...' : 'Get OTP'}
            </Button>
          </>
        )}

        {step === 'otp' && (
          <>
            <p className="text-sm font-semibold text-ink-900 mb-1">Enter the OTP</p>
            <p className="text-xs text-ink-500 mb-4">Sent to {fullNumber}</p>
            {debugOtp && (
              <p className="text-xs text-brand-purple bg-brand-lavender rounded-lg px-3 py-2 mb-4">
                Dev mode — your OTP is <span className="font-semibold">{debugOtp}</span>
              </p>
            )}
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 mb-4 tracking-widest text-center"
            />
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <Button className="w-full justify-center" onClick={handleVerifyOtp}>
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </Button>
            <button
              className="text-xs text-ink-500 mt-3 w-full text-center"
              onClick={() => {
                resetPhone();
                setStep('phone');
              }}
            >
              Change phone number
            </button>
          </>
        )}

        {step === 'profile-setup' && (
          <>
            <p className="text-sm font-semibold text-ink-900 mb-1">Complete your profile</p>
            <p className="text-xs text-ink-500 mb-4">Just the basics — you can add more later.</p>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 mb-3"
            />
            <input
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              placeholder="Blood group (optional)"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30 mb-4"
            />
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <Button className="w-full justify-center" onClick={handleProfileSetup} disabled={!fullName || loading}>
              {loading ? 'Saving...' : 'Continue to Dashboard'}
            </Button>
          </>
        )}

        {step === 'staff-redirect' && (
          <div className="text-center py-2">
            <p className="text-sm font-semibold text-ink-900 mb-1">Staff account recognized</p>
            <p className="text-xs text-ink-500 mb-3">
              Taking you to the Admin Portal — you'll confirm with one more OTP there.
            </p>
            <a href={ADMIN_PORTAL_URL} className="text-xs font-medium text-brand-purple">
              Not redirected? Continue to Admin Portal →
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
