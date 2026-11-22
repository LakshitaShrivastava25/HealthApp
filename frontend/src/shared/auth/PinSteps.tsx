import { useCallback, useEffect, useState } from 'react';

import FormError from './FormError';
import OTPInput from './OTPInput';
import PrimaryButton from './PrimaryButton';
import { StepHeading } from './Step';
import { describeSendOtpError, describeVerifyOtpError } from './authErrors';
import { userApi } from '../session/clients';
import { mpinApi, pinErrorMessage, type GrantResponse } from '../session/mpinApi';
import { maskPhone } from '../session/pin';

/**
 * The two steps shared by /login's Forgot PIN flow and /pin/setup — the
 * website's version of the mobile app's mpinSteps.tsx: verify the number by
 * code, and choose a PIN twice.
 */

export const PIN_LENGTH = 4;
const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/** Send a code to the account's number and exchange it for a PIN grant. */
export function OtpStep({
  phone,
  onVerified,
  onCancel,
}: {
  phone: string;
  onVerified: (data: GrantResponse) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await userApi.post('/auth/send-otp/', { phone_number: phone });
      setSent(true);
      setOtp('');
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    } catch (err) {
      setError(describeSendOtpError(err));
    } finally {
      setBusy(false);
    }
  }

  const verify = useCallback(
    async (code: string) => {
      if (code.length !== OTP_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      try {
        const { data } = await mpinApi.grant(phone, code);
        await onVerified(data);
      } catch (err) {
        setError(describeVerifyOtpError(err, { rejectedAttempts: 0 }));
        setOtp('');
      } finally {
        setBusy(false);
      }
    },
    [busy, onVerified, phone]
  );

  return (
    <div>
      <StepHeading
        title="Verify your number"
        subtitle={sent ? `Enter the 6-digit code sent to ${maskPhone(phone)}` : `We'll text a code to ${maskPhone(phone)}`}
      />

      {sent && (
        <>
          <OTPInput
            value={otp}
            onChange={(v) => {
              setOtp(v);
              if (error) setError(null);
            }}
            onComplete={verify}
            disabled={busy}
            invalid={!!error}
            autoFocus
          />
          <div className="mt-3 flex justify-end text-[11.5px]">
            {left > 0 ? (
              <span className="text-ink-300">Resend code in {left}s</span>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="font-semibold text-brand-purple underline-offset-2 hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            )}
          </div>
        </>
      )}

      <FormError message={error} />

      {!sent && (
        <div className="mt-5">
          <PrimaryButton state={busy ? 'loading' : 'idle'} loadingLabel="Sending code…" onClick={send}>
            Send code
          </PrimaryButton>
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 block w-full text-center text-[12px] text-ink-500 underline-offset-2 hover:underline"
        >
          Back
        </button>
      )}
    </div>
  );
}

/** Choose a PIN, then type it again. */
export function ChooseStep({
  title = 'Choose a PIN',
  subtitle = "You'll use this to sign in",
  onDone,
}: {
  title?: string;
  subtitle?: string;
  onDone: (pin: string) => Promise<void>;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirming = first.length === PIN_LENGTH;

  const submit = useCallback(
    async (code: string) => {
      if (code.length !== PIN_LENGTH || busy) return;
      if (code !== first) {
        setError('Those PINs did not match. Try again.');
        setFirst('');
        setSecond('');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await onDone(code);
      } catch (err) {
        setError(pinErrorMessage(err, 'Could not set your PIN. Please try again.'));
        setFirst('');
        setSecond('');
      } finally {
        setBusy(false);
      }
    },
    [busy, first, onDone]
  );

  return (
    <div>
      <StepHeading
        title={confirming ? 'Confirm your PIN' : title}
        subtitle={confirming ? 'Type it once more' : subtitle}
      />

      <div className="mx-auto max-w-[248px]">
        {/* Keyed so the confirm boxes start empty and focused. */}
        <OTPInput
          key={confirming ? 'confirm' : 'choose'}
          value={confirming ? second : first}
          onChange={(v) => {
            if (confirming) setSecond(v);
            else setFirst(v);
            if (error) setError(null);
          }}
          onComplete={confirming ? submit : undefined}
          length={PIN_LENGTH}
          masked
          label={confirming ? 'Confirm PIN' : 'New PIN'}
          disabled={busy}
          invalid={!!error}
          autoFocus
        />
      </div>

      <FormError message={error} />

      {busy && <p className="mt-3 text-center text-[12px] text-ink-500">Saving your PIN…</p>}

      {confirming && !busy && (
        <button
          type="button"
          onClick={() => {
            setFirst('');
            setSecond('');
            setError(null);
          }}
          className="mt-4 block w-full text-center text-[12px] text-ink-500 underline-offset-2 hover:underline"
        >
          Start over
        </button>
      )}
    </div>
  );
}
