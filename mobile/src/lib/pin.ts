import * as SecureStore from 'expo-secure-store';

/**
 * What the PIN sign-in keeps on the device.
 *
 * Two device tokens, not one, and the difference matters. The MPIN token
 * has to be readable without a face match, because the PIN is the fallback
 * when biometrics fail — so it sits in the keychain under default
 * protection. The biometric token is stored with `requireAuthentication`,
 * which means the Secure Enclave will not hand it over without a live
 * match. Anyone who dumps the keychain therefore gets only the token that
 * still needs four digits the server will stop guessing after fifteen
 * tries.
 *
 * The `curapath_` prefix follows mode.ts. tokens.ts still uses the older
 * `healthnow_` one; this does not extend it.
 */

const MPIN_TOKEN_KEY = 'curapath_mpin_device_token';
const BIOMETRIC_TOKEN_KEY = 'curapath_mpin_biometric_token';
const HINT_KEY = 'curapath_pin_hint';
const PROMPTED_KEY = 'curapath_lock_prompted';

/**
 * What the lock screen is allowed to know before anyone has unlocked it:
 * which account it belongs to, the number to show masked on the Forgot PIN
 * step, and whether to offer Face ID. Deliberately nothing medical.
 */
export type PinHint = {
  accountId: string;
  phone: string;
  biometric: boolean;
};

/** Reads never throw: a failure here must not stop the app from starting. */
async function get(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function getMpinToken() {
  return get(MPIN_TOKEN_KEY);
}

export async function setMpinToken(token: string) {
  await SecureStore.setItemAsync(MPIN_TOKEN_KEY, token);
}

/**
 * Behind the Secure Enclave. The read prompts for a face or fingerprint and
 * throws if the user cancels or the item was invalidated — which iOS and
 * Android both do when someone re-enrols their biometrics. Callers treat a
 * failure as "no biometrics" and fall back to the PIN.
 */
export async function getBiometricToken() {
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock CuraPath',
    });
  } catch {
    return null;
  }
}

export async function setBiometricToken(token: string) {
  await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock CuraPath',
  });
}

export async function clearBiometricToken() {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
  } catch {
    // Already gone, or the keychain refused. Nothing to recover.
  }
}

/** Everything the PIN holds. Called on sign-out and when a token dies. */
export async function clearPin() {
  await Promise.all([
    SecureStore.deleteItemAsync(MPIN_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(HINT_KEY).catch(() => undefined),
  ]);
}

export async function getPinHint(): Promise<PinHint | null> {
  const raw = await get(HINT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinHint;
  } catch {
    return null;
  }
}

export async function setPinHint(hint: PinHint) {
  try {
    await SecureStore.setItemAsync(HINT_KEY, JSON.stringify(hint));
  } catch {
    // The hint is a convenience; losing it only costs a less friendly
    // lock screen, so never let it fail a sign-in.
  }
}

/** Whether the one-time "set up the PIN" offer has already been made. */
export async function wasPrompted() {
  return (await get(PROMPTED_KEY)) === '1';
}

export async function markPrompted() {
  try {
    await SecureStore.setItemAsync(PROMPTED_KEY, '1');
  } catch {
    // Worst case the offer appears once more.
  }
}

/** "+91 98765 43210" -> "+91 ••••• 43210". */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `+91 ••••• ${digits.slice(-5)}`;
}
