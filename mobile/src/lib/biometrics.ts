import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/** What to call it on screen, so the button matches the hardware. */
export type BiometricKind = 'face' | 'fingerprint' | 'iris';

export type BiometricSupport = {
  available: boolean;
  kind: BiometricKind | null;
  label: string;
};

/**
 * Whether this phone can do biometrics *and* someone has enrolled.
 *
 * Both halves matter: hardware with no enrolled face fails every prompt,
 * and a button that always fails is worse than no button. Callers hide the
 * option entirely when this says no.
 */
export async function describeBiometrics(): Promise<BiometricSupport> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!hasHardware || !enrolled) return { available: false, kind: null, label: '' };

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return { available: true, kind: 'face', label: Platform.OS === 'ios' ? 'Face ID' : 'face unlock' };
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return { available: true, kind: 'iris', label: 'iris unlock' };
    }
    return {
      available: true,
      kind: 'fingerprint',
      label: Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint',
    };
  } catch {
    return { available: false, kind: null, label: '' };
  }
}

/**
 * Prompt for a face or fingerprint.
 *
 * `disableDeviceFallback: true` is the whole point. Left at its default of
 * false, iOS offers "Enter Passcode" when the face is not recognised — so
 * anyone who knows the phone's passcode walks straight past the MPIN and
 * App Lock protects nothing it did not already. Someone who cannot use
 * biometrics falls back to the PIN on our own screen instead.
 */
export async function authenticate(promptMessage = 'Unlock CuraPath'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
      requireConfirmation: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
