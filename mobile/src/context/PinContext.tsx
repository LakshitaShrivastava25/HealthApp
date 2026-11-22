import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

import { useAuth } from './AuthContext';
import { mpinApi } from '../lib/api';
import {
  clearBiometricToken,
  clearPin,
  getBiometricToken,
  getMpinToken,
  getPinHint,
  setBiometricToken,
  setMpinToken,
  setPinHint,
  type PinHint,
} from '../lib/pin';
import { authenticate, describeBiometrics, type BiometricSupport } from '../lib/biometrics';

/**
 * The PIN is a *login* credential, not a lock on a running app.
 *
 * Signing in with it, registering this device for it, changing it and the
 * biometric shortcut all live here. Nothing in this file watches the app
 * going to the background or covers the screen — opening CuraPath while
 * signed in behaves exactly as it always has.
 *
 * Mounted inside AuthProvider because signing in with a PIN produces a
 * token pair that auth then adopts.
 */

type PinValue = {
  /** True when this phone is registered, so the PIN can be used here. */
  isRegistered: boolean;
  biometric: BiometricSupport & { enabled: boolean };
  hint: PinHint | null;
  attemptsLeft: number | null;
  /** Epoch ms the server says to wait until, from a lockout or a throttle. */
  waitUntil: number | null;
  error: string | null;
  signInWithPin: (phone: string, pin: string) => Promise<boolean>;
  signInWithBiometrics: () => Promise<boolean>;
  /** Register this phone against a PIN the account already has. */
  registerDevice: () => Promise<void>;
  /** Set a first PIN, or replace one (which needs an OTP grant). */
  setPin: (pin: string, grant?: string) => Promise<void>;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => Promise<void>;
  /** Undo this device's registration — a shared or sold phone. */
  removeDevice: () => Promise<void>;
  clearError: () => void;
};

const PinContext = createContext<PinValue | null>(null);

const NO_BIOMETRICS = { available: false, kind: null, label: '', enabled: false };

function deviceLabel() {
  return (Device.modelName || Device.deviceName || 'This device').slice(0, 80);
}

export function PinProvider({ children }: { children: ReactNode }) {
  const { adoptSession, markMpinSet } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [hint, setHint] = useState<PinHint | null>(null);
  const [biometric, setBiometric] = useState<PinValue['biometric']>(NO_BIOMETRICS);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [token, saved, support] = await Promise.all([
        getMpinToken(),
        getPinHint(),
        describeBiometrics(),
      ]);
      setIsRegistered(!!token);
      setHint(saved);
      setBiometric({ ...support, enabled: support.available && !!saved?.biometric });
    })();
  }, []);

  const applyFailure = useCallback((err: unknown) => {
    const response = (err as { response?: { status?: number; data?: Record<string, unknown>; headers?: Record<string, string> } })
      ?.response;
    const data = response?.data ?? {};

    if (data.device_unknown || data.mpin_cleared) {
      // The server no longer knows this device. Forget it and fall back to
      // registering again with a code.
      void clearPin();
      setIsRegistered(false);
      setError('Sign in with a code to use this phone again.');
      return;
    }

    if (response?.status === 429) {
      // Two different 429s land here: the per-account lockout, which sends
      // retry_after, and DRF's own throttle, which only sets Retry-After.
      // Both become a countdown rather than a number of seconds in prose.
      const header = Number(response.headers?.['retry-after'] ?? 0);
      const seconds = typeof data.retry_after === 'number' ? data.retry_after : header;
      if (seconds > 0) setWaitUntil(Date.now() + seconds * 1000);
      setAttemptsLeft(null);
      setError(null);
      return;
    }

    if (typeof data.attempts_left === 'number') setAttemptsLeft(data.attempts_left);
    setError(typeof data.detail === 'string' ? data.detail : 'Could not sign in. Please try again.');
  }, []);

  const afterSignIn = useCallback(
    async (data: {
      access: string;
      refresh: string;
      device_token?: string;
      account?: { id: string; phone_number: string };
    }) => {
      if (data.account) {
        // Signing into a different account than the one this phone was
        // registered to: drop the old account's tokens first, then remember
        // the new one — otherwise AuthContext, seeing a different account,
        // would clear the token just issued for this one.
        const previous = await getPinHint();
        if (previous && previous.accountId !== data.account.id) {
          await clearPin();
          setIsRegistered(false);
          setBiometric((b) => ({ ...b, enabled: false }));
        }
        await setPinHint({
          accountId: data.account.id,
          phone: data.account.phone_number,
          biometric: previous?.accountId === data.account.id ? previous.biometric : false,
        });
      }
      if (data.device_token) {
        await setMpinToken(data.device_token);
        setIsRegistered(true);
      }
      setAttemptsLeft(null);
      setWaitUntil(null);
      setError(null);
      await adoptSession(data.access, data.refresh);
    },
    [adoptSession]
  );

  const signInWithPin = useCallback(
    async (phone: string, pin: string) => {
      setError(null);
      try {
        const [token, hint] = await Promise.all([getMpinToken(), getPinHint()]);
        // This phone's token only speaks for the account it was issued to.
        // Any other number signs in by number + PIN, which works on any
        // phone and registers this one for that account on success.
        const useToken = token && hint?.phone === phone;
        const { data } = useToken ? await mpinApi.unlock(token, pin) : await mpinApi.unlockByPhone(phone, pin);
        await afterSignIn(data);
        return true;
      } catch (err) {
        applyFailure(err);
        return false;
      }
    },
    [afterSignIn, applyFailure]
  );

  const signInWithBiometrics = useCallback(async () => {
    setError(null);
    if (!(await authenticate())) return false;
    // Reading this token is itself gated by the Secure Enclave, so holding
    // it is the proof. It fails if the user re-enrolled their face, which
    // invalidates the item — fall back to the PIN without complaint.
    const token = await getBiometricToken();
    if (!token) {
      await clearBiometricToken();
      setBiometric((b) => ({ ...b, enabled: false }));
      return false;
    }
    try {
      const { data } = await mpinApi.unlock(token);
      await afterSignIn(data);
      return true;
    } catch (err) {
      applyFailure(err);
      return false;
    }
  }, [afterSignIn, applyFailure]);

  const registerDevice = useCallback(async () => {
    const { data } = await mpinApi.enrollDevice({ label: deviceLabel(), platform: Platform.OS });
    await setMpinToken(data.device_token);
    setIsRegistered(true);
  }, []);

  const setPin = useCallback(async (pin: string, grant?: string) => {
    const { data } = await mpinApi.set({
      mpin: pin,
      ...(grant ? { otp_grant: grant } : {}),
      label: deviceLabel(),
      platform: Platform.OS,
    });
    await setMpinToken(data.device_token);
    setIsRegistered(true);
    setAttemptsLeft(null);
    setWaitUntil(null);
    // Without this the account still reads has_mpin: false, and the check
    // that sends people to set a PIN would send them straight back to the
    // screen they just finished.
    markMpinSet();
  }, [markMpinSet]);

  const enableBiometrics = useCallback(async () => {
    const support = await describeBiometrics();
    if (!support.available) return false;
    if (!(await authenticate('Confirm to turn on quick sign-in'))) return false;
    const { data } = await mpinApi.enrollDevice({
      kind: 'biometric',
      label: deviceLabel(),
      platform: Platform.OS,
    });
    await setBiometricToken(data.device_token);
    setBiometric({ ...support, enabled: true });
    const saved = await getPinHint();
    if (saved) await setPinHint({ ...saved, biometric: true });
    return true;
  }, []);

  const disableBiometrics = useCallback(async () => {
    const token = await getBiometricToken();
    // Retire it server-side too, so a lifted keychain item is useless.
    if (token) void mpinApi.revokeDevice(token).catch(() => undefined);
    await clearBiometricToken();
    setBiometric((b) => ({ ...b, enabled: false }));
    const saved = await getPinHint();
    if (saved) await setPinHint({ ...saved, biometric: false });
  }, []);

  const removeDevice = useCallback(async () => {
    const token = await getMpinToken();
    if (token) await mpinApi.revokeDevice(token).catch(() => undefined);
    await clearPin();
    setIsRegistered(false);
    setBiometric((b) => ({ ...b, enabled: false }));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<PinValue>(
    () => ({
      isRegistered,
      biometric,
      hint,
      attemptsLeft,
      waitUntil,
      error,
      signInWithPin,
      signInWithBiometrics,
      registerDevice,
      setPin,
      enableBiometrics,
      disableBiometrics,
      removeDevice,
      clearError,
    }),
    [
      isRegistered, biometric, hint, attemptsLeft, waitUntil, error,
      signInWithPin, signInWithBiometrics, registerDevice, setPin,
      enableBiometrics, disableBiometrics, removeDevice, clearError,
    ]
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePin() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePin must be used within PinProvider');
  return ctx;
}
