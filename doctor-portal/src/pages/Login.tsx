import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import PhoneInput, { usePhoneInput } from '../components/PhoneInput';

type Step = 'phone' | 'otp';

export default function Login() {
  const { sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const { country, setCountry, digits, setDigits, isComplete, fullNumber, reset: resetPhone } = usePhoneInput();
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    setError('');
    setLoading(true);
    try {
      const result = await sendOtp(fullNumber);
      setDebugOtp(result.debug_otp ?? null);
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
      await verifyOtp(fullNumber, otp);
      navigate('/');
    } catch {
      setError('Invalid or expired OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-teal via-brand-purple to-brand-purpleDark flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full bg-white/10" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[28rem] h-[28rem] rounded-full bg-white/5" />

      <Card className="w-full max-w-sm p-8 relative z-10 !shadow-2xl">
        <div className="flex items-center justify-center mb-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-teal to-brand-purple flex items-center justify-center text-white shadow-md">
            <Stethoscope size={26} strokeWidth={2.5} />
          </div>
        </div>
        <p className="font-bold text-ink-900 text-xl text-center mt-3">HealthNow Doctor</p>
        <p className="text-xs text-ink-500 text-center mb-6">Sign in with your registered phone number</p>

        {step === 'phone' && (
          <>
            <p className="text-sm font-semibold text-ink-900 mb-1">Phone number</p>
            <div className="mt-2 mb-4">
              <PhoneInput country={country} onCountryChange={setCountry} digits={digits} onDigitsChange={setDigits} />
            </div>
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <Button className="w-full justify-center" onClick={handleSendOtp} disabled={loading || !isComplete}>
              {loading ? 'Sending...' : 'Get OTP'}
            </Button>
            <p className="text-xs text-ink-500 mt-4 text-center">
              New doctor? Use the same phone number — you'll register right after signing in.
            </p>
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
            <Button className="w-full justify-center" onClick={handleVerifyOtp} disabled={loading || !otp}>
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
      </Card>
    </div>
  );
}
