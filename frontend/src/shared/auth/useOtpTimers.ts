import { useCallback, useEffect, useRef, useState } from 'react';

/** Mirrors OTP_TTL_MINUTES in backend/accounts/services.py. */
export const OTP_TTL_SECONDS = 5 * 60;
/** How long before "Resend code" becomes available again. */
export const RESEND_COOLDOWN_SECONDS = 30;
/** Mirrors OTP_RATE_LIMIT_PER_HOUR — the point at which sending stops. */
export const MAX_SENDS_PER_HOUR = 5;

/**
 * The two clocks the OTP step needs: how long this code stays valid, and
 * how long until another one can be requested.
 *
 * Both are derived from a single deadline timestamp ticked once a second,
 * rather than from decrementing counters. A tab that gets backgrounded
 * stops receiving timer callbacks, so counters drift while wall-clock
 * deadlines stay correct — this way, coming back to the tab after three
 * minutes shows the two minutes that are genuinely left.
 *
 * `sendCount` is tracked so the UI can stop offering a resend once the
 * backend's five-per-hour limit is spent, instead of letting someone
 * spend their last attempt on a 429.
 */
export function useOtpTimers() {
  const expiresAt = useRef<number | null>(null);
  const resendAt = useRef<number | null>(null);

  const [expiresIn, setExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [sendCount, setSendCount] = useState(0);

  /** Call after a code has actually been sent. */
  const startCycle = useCallback(() => {
    const now = Date.now();
    expiresAt.current = now + OTP_TTL_SECONDS * 1000;
    resendAt.current = now + RESEND_COOLDOWN_SECONDS * 1000;
    setExpiresIn(OTP_TTL_SECONDS);
    setResendIn(RESEND_COOLDOWN_SECONDS);
    setSendCount((n) => n + 1);
  }, []);

  /** Call when leaving the OTP step, e.g. changing the phone number. */
  const reset = useCallback(() => {
    expiresAt.current = null;
    resendAt.current = null;
    setExpiresIn(0);
    setResendIn(0);
    setSendCount(0);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (expiresAt.current !== null) {
        setExpiresIn(Math.max(0, Math.ceil((expiresAt.current - now) / 1000)));
      }
      if (resendAt.current !== null) {
        setResendIn(Math.max(0, Math.ceil((resendAt.current - now) / 1000)));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return {
    expiresIn,
    resendIn,
    sendCount,
    startCycle,
    reset,
    isExpired: expiresAt.current !== null && expiresIn === 0,
    canResend: resendIn === 0 && sendCount < MAX_SENDS_PER_HOUR,
    sendsExhausted: sendCount >= MAX_SENDS_PER_HOUR,
  };
}

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
