import { useCallback, useEffect, useRef, useState } from 'react';

/** How long before "Resend code" becomes available again. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Mirrors OTP_RATE_LIMIT_PER_HOUR — the point at which sending stops. */
export const MAX_SENDS_PER_HOUR = 5;

/**
 * The one clock the OTP step needs: how long until another code can be
 * requested. There is deliberately no expiry countdown — the backend is
 * the authority on whether a code is still live, and says so when it isn't.
 *
 * The countdown is derived from a deadline timestamp ticked once a second,
 * rather than from a decrementing counter. A tab that gets backgrounded
 * stops receiving timer callbacks, so counters drift while wall-clock
 * deadlines stay correct — this way, coming back to the tab after forty
 * seconds shows the twenty that are genuinely left.
 *
 * `sendCount` is tracked so the UI can stop offering a resend once the
 * backend's five-per-hour limit is spent, instead of letting someone
 * spend their last attempt on a 429.
 */
export function useOtpTimers() {
  const resendAt = useRef<number | null>(null);

  const [resendIn, setResendIn] = useState(0);
  const [sendCount, setSendCount] = useState(0);

  /** Call after a code has actually been sent. */
  const startCycle = useCallback(() => {
    resendAt.current = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setResendIn(RESEND_COOLDOWN_SECONDS);
    setSendCount((n) => n + 1);
  }, []);

  /** Call when leaving the OTP step, e.g. changing the phone number. */
  const reset = useCallback(() => {
    resendAt.current = null;
    setResendIn(0);
    setSendCount(0);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (resendAt.current !== null) {
        setResendIn(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000)));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return {
    resendIn,
    sendCount,
    startCycle,
    reset,
    canResend: resendIn === 0 && sendCount < MAX_SENDS_PER_HOUR,
    sendsExhausted: sendCount >= MAX_SENDS_PER_HOUR,
  };
}
