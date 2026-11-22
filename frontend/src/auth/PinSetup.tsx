import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

import { AuthCard, AuthShell, ChooseStep, CuraPathLogo, OtpStep } from '@shared/auth';
import { useSession } from '@shared/session/SessionContext';
import { usePin } from '@shared/session/PinContext';
import { needsOtp } from '@shared/session/mpinApi';
import SessionStatus from './SessionStatus';

/**
 * /pin/setup — set a first PIN, or change one (`?mode=change`). The
 * website's version of the mobile app's mpin-setup screen.
 *
 * Reached two ways. RequirePin sends anyone here whose account has no PIN
 * yet — the PIN is how they sign in. Settings sends people here to change
 * it, which always starts at a code: replacing a PIN has to cost an SMS, or
 * anyone at an unlocked computer could swap it quietly.
 */
export default function PinSetup() {
  const { isLoading, isAuthenticated, account } = useSession();
  const pin = usePin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const changing = params.get('mode') === 'change';

  const [step, setStep] = useState<'otp' | 'choose'>(changing ? 'otp' : 'choose');
  const [grant, setGrant] = useState('');
  const [pendingPin, setPendingPin] = useState('');

  if (isLoading) return <SessionStatus />;
  if (!isAuthenticated || !account) return <Navigate to="/login" replace />;

  function finish() {
    // Back to Settings (or wherever) after a change; the app's home after a first PIN.
    if (changing && window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  }

  return (
    <AuthShell>
      <AuthCard>
        <div className="mb-6">
          <CuraPathLogo portal="patient" />
        </div>

        {step === 'otp' && (
          <OtpStep
            phone={account.phone_number}
            onCancel={changing ? finish : undefined}
            onVerified={async (data) => {
              setGrant(data.grant);
              if (pendingPin) {
                // Came here mid-setup: finish the PIN already chosen rather
                // than making them pick one twice.
                await pin.setPin(pendingPin, data.grant);
                setPendingPin('');
                finish();
                return;
              }
              setStep('choose');
            }}
          />
        )}

        {step === 'choose' && (
          <>
            {!changing && (
              <div className="mb-5 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-lavender text-brand-purple">
                  <KeyRound size={22} />
                </div>
              </div>
            )}
            <ChooseStep
              title={changing ? 'Set a new PIN' : 'Create your PIN'}
              subtitle={
                changing
                  ? "You'll use the new PIN to sign in on every device."
                  : 'You will use this to sign in from now on, instead of waiting for a code each time.'
              }
              onDone={async (next) => {
                try {
                  await pin.setPin(next, grant || undefined);
                } catch (err) {
                  // The server wants a code when the last sign-in is too old
                  // to stand as proof. Go and get one rather than showing an
                  // error that reads as if the PIN itself were refused.
                  if (needsOtp(err)) {
                    setPendingPin(next);
                    setStep('otp');
                    return;
                  }
                  throw err;
                }
                finish();
              }}
            />
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
