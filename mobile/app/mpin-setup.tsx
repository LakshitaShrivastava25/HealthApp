import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackLink from '../src/components/BackLink';
import { ChooseStep, OtpStep } from '../src/components/mpinSteps';
import { useAuth } from '../src/context/AuthContext';
import { usePin } from '../src/context/PinContext';
import { useBackHandler } from '../src/lib/useBackHandler';
import { resetTo } from '../src/lib/navigation';
import { colors, spacing, type } from '../src/theme';

/**
 * Set a first PIN, or change one.
 *
 * Reached two ways. The router sends anyone here whose account has no PIN
 * yet — that is required, because the PIN *is* how they sign in, and an
 * account without one would have no way back in but a reset. Settings sends
 * people here with `?mode=change`, which always starts at a code: replacing
 * a PIN has to cost an SMS, or anyone holding an unlocked phone could swap
 * it quietly and keep their way in after the owner signed out.
 */
export default function MpinSetup() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const changing = mode === 'change';
  const { account, logout } = useAuth();
  const pin = usePin();
  const [step, setStep] = useState<'otp' | 'choose' | 'biometrics'>(changing ? 'otp' : 'choose');
  const [grant, setGrant] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [leaving, setLeaving] = useState(false);

  function finish() {
    if (changing) router.back();
    else router.replace('/');
  }

  /**
   * "← Back" and Android's Back. Changing a PIN goes back to where it came
   * from. A first PIN is required to use the app, so there the way back is
   * the login page, signed out. Asked for a code part-way through choosing,
   * Back returns to choosing; on the fingerprint offer it just skips it.
   */
  async function goBack() {
    if (leaving) return;
    if (step === 'otp' && pendingPin) {
      setPendingPin('');
      setStep('choose');
      return;
    }
    if (step === 'biometrics' || changing) {
      finish();
      return;
    }
    setLeaving(true);
    try {
      await logout();
    } finally {
      resetTo('/login');
    }
  }

  useBackHandler(() => {
    void goBack();
    return true;
  });

  const backLabel =
    changing || step === 'biometrics' || (step === 'otp' && pendingPin) ? 'Back' : 'Back to login';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.backWrap}>
          <BackLink onPress={() => void goBack()} label={backLabel} disabled={leaving} />
        </View>
        {step === 'otp' && (
          <OtpStep
            phone={account?.phone_number ?? ''}
            onCancel={changing ? () => router.back() : undefined}
            onVerified={async (data) => {
              setGrant(data.grant);
              if (pendingPin) {
                // Came here mid-setup, so finish the PIN already chosen
                // rather than making them pick one twice.
                await pin.setPin(pendingPin, data.grant);
                setPendingPin('');
                if (pin.biometric.available && !pin.biometric.enabled) setStep('biometrics');
                else finish();
                return;
              }
              setStep('choose');
            }}
          />
        )}

        {step === 'choose' && (
          <>
            {!changing && (
              <View style={styles.intro}>
                <Feather name="lock" size={30} color={colors.brandPurple} />
                <Text style={styles.title}>Create your PIN</Text>
                <Text style={styles.sub}>
                  You will use this to sign in from now on, instead of waiting for a code each time.
                </Text>
              </View>
            )}
            <ChooseStep
              title={changing ? 'Set a new PIN' : 'Choose a PIN'}
              hideHeader={!changing}
              onDone={async (next) => {
                try {
                  await pin.setPin(next, grant || undefined);
                } catch (err) {
                  // The server wants a code when the last sign-in is too old
                  // to stand as proof. Go and get one rather than showing a
                  // red error under the keypad, which reads as if the PIN
                  // itself were refused.
                  if (needsOtp(err)) {
                    setPendingPin(next);
                    setStep('otp');
                    return;
                  }
                  throw err;
                }
                if (pin.biometric.available && !pin.biometric.enabled) setStep('biometrics');
                else finish();
              }}
            />
          </>
        )}

        {step === 'biometrics' && (
          <View style={styles.step}>
            <Feather name="unlock" size={34} color={colors.brandPurple} />
            <Text style={styles.title}>Sign in with {pin.biometric.label}?</Text>
            <Text style={styles.sub}>
              Skip typing your PIN. It stays available whenever you need it.
            </Text>
            <Pressable
              style={styles.primary}
              onPress={async () => {
                await pin.enableBiometrics();
                finish();
              }}
            >
              <Text style={styles.primaryText}>Turn on {pin.biometric.label}</Text>
            </Pressable>
            <Pressable onPress={finish}>
              <Text style={styles.quiet}>Not now</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** True when the backend wants an SMS code before it will set a PIN. */
function needsOtp(err: unknown) {
  return !!(err as { response?: { data?: { otp_required?: boolean } } })?.response?.data?.otp_required;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  backWrap: { alignSelf: 'stretch', maxWidth: 360, width: '100%', marginHorizontal: 'auto' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  intro: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg, maxWidth: 340 },
  step: { width: '100%', maxWidth: 360, alignItems: 'center', gap: spacing.md },
  title: { ...type.h2, textAlign: 'center' },
  sub: { ...type.caption, textAlign: 'center', lineHeight: 18 },
  primary: {
    backgroundColor: colors.brandPurple,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  quiet: { ...type.caption, color: colors.ink500, textDecorationLine: 'underline' },
});
