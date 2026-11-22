import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';

import { useSession, type VerifyResult } from './SessionContext';
import { mpinApi, pinErrorMessage, type TokenResponse } from './mpinApi';
import { browserLabel, clearPin, getMpinToken, setMpinToken } from './pin';

/**
 * PIN sign-in for the website — the counterpart of the mobile app's
 * PinContext. The PIN is a *login* credential, not a lock on an open tab:
 * nothing here watches for idle time or covers the page.
 *
 * Signing in with it, registering this browser, setting or changing it and
 * removing this browser all live here. Mounted inside SessionProvider,
 * because a PIN sign-in produces a token pair the session then adopts.
 */

type PinValue = {
  /** True when this browser is registered, so the PIN can be used here. */
  isRegistered: boolean;
  attemptsLeft: number | null;
  /** Epoch ms the server says to wait until, from a lockout or a throttle. */
  waitUntil: number | null;
  error: string | null;
  /** Resolves to the signed-in result, or null when refused (see `error`). */
  signInWithPin: (phone: string, pin: string) => Promise<VerifyResult | null>;
  /** Register this browser against a PIN the account already has. */
  registerDevice: () => Promise<void>;
  /** Set a first PIN, or replace one (which needs an OTP grant). */
  setPin: (pin: string, grant?: string) => Promise<void>;
  /** Undo this browser's registration — a shared or public computer. */
  removeDevice: () => Promise<void>;
  clearError: () => void;
};

const PinContext = createContext<PinValue | null>(null);

const PLATFORM = 'web';

export function PinProvider({ children }: { children: ReactNode }) {
  const { adoptSession, markMpinSet } = useSession();
  const [isRegistered, setIsRegistered] = useState(() => !!getMpinToken());
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyFailure = useCallback((err: unknown) => {
    const response = axios.isAxiosError(err) ? err.response : undefined;
    const data = (response?.data ?? {}) as Record<string, unknown>;

    if (data.device_unknown || data.mpin_cleared) {
      // The server no longer knows this browser. Forget it and fall back to
      // registering again with a code.
      clearPin();
      setIsRegistered(false);
      setAttemptsLeft(null);
      setError('Sign in with a code to use this browser again.');
      return;
    }

    if (response?.status === 429) {
      // Two different 429s land here: the PIN lockout, which sends
      // retry_after, and DRF's own throttle, which only sets Retry-After.
      // Both become a countdown.
      const header = Number(response.headers?.['retry-after'] ?? 0);
      const seconds = typeof data.retry_after === 'number' ? data.retry_after : header;
      if (seconds > 0) setWaitUntil(Date.now() + seconds * 1000);
      setAttemptsLeft(null);
      setError(null);
      return;
    }

    if (typeof data.attempts_left === 'number') setAttemptsLeft(data.attempts_left);
    setError(pinErrorMessage(err, 'Could not sign in. Please try again.'));
  }, []);

  const signInWithPin = useCallback(
    async (phone: string, pin: string) => {
      setError(null);
      let data: TokenResponse;
      try {
        const token = getMpinToken();
        // A registered browser signs in by token, which names no account at
        // all. Only an unregistered one has to send the number.
        ({ data } = token ? await mpinApi.unlock(token, pin) : await mpinApi.unlockByPhone(phone, pin));
      } catch (err) {
        applyFailure(err);
        return null;
      }
      if (data.device_token) {
        setMpinToken(data.device_token);
        setIsRegistered(true);
      }
      setAttemptsLeft(null);
      setWaitUntil(null);
      return adoptSession(data);
    },
    [adoptSession, applyFailure]
  );

  const registerDevice = useCallback(async () => {
    const { data } = await mpinApi.enrollDevice({ label: browserLabel(), platform: PLATFORM });
    setMpinToken(data.device_token);
    setIsRegistered(true);
  }, []);

  const setPin = useCallback(
    async (pin: string, grant?: string) => {
      const { data } = await mpinApi.set({
        mpin: pin,
        ...(grant ? { otp_grant: grant } : {}),
        label: browserLabel(),
        platform: PLATFORM,
      });
      setMpinToken(data.device_token);
      setIsRegistered(true);
      setAttemptsLeft(null);
      setWaitUntil(null);
      setError(null);
      // Without this the account still reads has_mpin: false, and the
      // set-a-PIN redirect would send them straight back to the page they
      // just finished.
      markMpinSet();
    },
    [markMpinSet]
  );

  const removeDevice = useCallback(async () => {
    const token = getMpinToken();
    // Retire it server-side too, so a copied token is useless.
    if (token) await mpinApi.revokeDevice(token).catch(() => undefined);
    clearPin();
    setIsRegistered(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<PinValue>(
    () => ({
      isRegistered,
      attemptsLeft,
      waitUntil,
      error,
      signInWithPin,
      registerDevice,
      setPin,
      removeDevice,
      clearError,
    }),
    [isRegistered, attemptsLeft, waitUntil, error, signInWithPin, registerDevice, setPin, removeDevice, clearError]
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePin() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePin must be used within PinProvider');
  return ctx;
}
