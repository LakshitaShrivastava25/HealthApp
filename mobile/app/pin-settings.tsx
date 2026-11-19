import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, CardHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { usePin } from '../src/context/PinContext';
import { colors, spacing, type } from '../src/theme';

/**
 * PIN settings. One screen for every role.
 *
 * Note what "Remove this device" means here: signing out deliberately keeps
 * the phone registered, so the PIN still works next time. This is the
 * explicit way to undo that — for a shared phone, or one being sold.
 */
export default function PinSettingsScreen() {
  const { account } = useAuth();
  const pin = usePin();
  const [busy, setBusy] = useState(false);
  const on = pin.isRegistered;

  async function toggleBiometrics(next: boolean) {
    setBusy(true);
    try {
      // Off only forgets the hardware-bound token. App Lock itself stays
      // on and the PIN keeps working — turning it off here would be a
      // surprising amount of damage from a switch labelled "Face ID".
      if (next) await pin.enableBiometrics();
      else await pin.disableBiometrics();
    } finally {
      setBusy(false);
    }
  }

  function confirmDisable() {
    Alert.alert(
      'Remove this device?',
      'Your PIN stays on your account and keeps working on your other phones. On this one you will need a code to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await pin.removeDevice();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <CardHeader
            title="Your PIN"
            subtitle={
              on
                ? 'You sign in with your 4-digit PIN on this phone.'
                : 'Set a PIN to sign in without waiting for a code.'
            }
          />
          {!on ? (
            <Pressable style={styles.primary} onPress={() => router.push('/mpin-setup')}>
              <Feather name="lock" size={16} color={colors.white} />
              <Text style={styles.primaryText}>Set up a PIN</Text>
            </Pressable>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Pressable
                style={styles.rowLink}
                onPress={() => router.push({ pathname: '/mpin-setup', params: { mode: 'change' } })}
              >
                <Text style={styles.rowText}>Change PIN</Text>
                <Feather name="chevron-right" size={18} color={colors.ink300} />
              </Pressable>

              {pin.biometric.available && (
                <View style={styles.rowLink}>
                  <Text style={styles.rowText}>Unlock with {pin.biometric.label}</Text>
                  <Switch
                    value={pin.biometric.enabled}
                    onValueChange={toggleBiometrics}
                    disabled={busy}
                    trackColor={{ true: colors.brandPurple }}
                  />
                </View>
              )}

              <Pressable style={styles.rowLink} onPress={confirmDisable} disabled={busy}>
                <Text style={[styles.rowText, { color: colors.danger }]}>Turn off App Lock</Text>
              </Pressable>
            </View>
          )}
        </Card>

        <Card>
          <CardHeader title="How it works" />
          <Text style={styles.note}>
            Your PIN signs you in. A one-time code is only used to set this phone up, or to reset a
            PIN you have forgotten — never as a second way to sign in.
          </Text>
          <Text style={styles.note}>
            After three wrong tries you will be asked to wait. If you forget it, tap Forgot PIN on
            the sign-in screen and verify your mobile number to set a new one.
          </Text>
          <Text style={styles.note}>
            Opening CuraPath while you are signed in never asks for the PIN. It does not encrypt the
            records already saved on this phone.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  primary: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.brandPurple,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  rowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowText: { ...type.body, color: colors.ink900 },
  note: { ...type.caption, marginTop: spacing.xs, lineHeight: 18 },
});
