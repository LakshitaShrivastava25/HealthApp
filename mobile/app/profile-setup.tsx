import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import DateField from '../src/components/DateField';
import { ModeSwitchCard } from '../src/components/ModeSwitch';
import MpinKeypad, { MPIN_LENGTH, MpinDots } from '../src/components/MpinKeypad';
import { OtpStep } from '../src/components/mpinSteps';
import { usePin } from '../src/context/PinContext';
import { Button, Card, ErrorNote, Input } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { profilesApi } from '../src/lib/api';
import { colors, radius, spacing, type } from '../src/theme';
import { useConfirmExit } from '../src/lib/useBackHandler';
import { useConfirmLogout } from '../src/hooks/useConfirmLogout';

const GENDERS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/** yyyy-mm-dd built from local parts — toISOString() uses UTC and can land
 *  on the wrong day for anyone near midnight. */
function isoToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * First run for a brand-new account. Creates the 'self' Profile that every
 * other record in the system hangs off — without it the patient screens
 * have nothing to scope to.
 *
 * A doctor who registered without a profile of their own lands here the
 * first time they switch to User mode, so the way back to Doctor mode is
 * offered too.
 *
 * For a new account this is the registration screen, same as the website:
 * the details and the 4-digit PIN (typed twice, on our own keypad) on one
 * screen. The PIN is saved first — it is how they sign in from then on —
 * and the profile straight after.
 */
export default function ProfileSetup() {
  useConfirmExit();
  const { refreshProfiles, account } = useAuth();
  const pin = usePin();
  const confirmLogout = useConfirmLogout();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  /** Which row the keypad types into. */
  const [pinField, setPinField] = useState<'pin' | 'confirm'>('pin');
  const [pinSaved, setPinSaved] = useState(false);
  /** The server wants a fresh code before it will set the PIN (sign-in too long ago). */
  const [reverify, setReverify] = useState(false);
  // Strictly false: an account whose PIN state is unknown is not asked.
  const askPin = pinSaved || account?.has_mpin === false;
  const pinMismatch = confirmPin.length === MPIN_LENGTH && confirmPin !== newPin;
  const pinReady = !askPin || pinSaved || (newPin.length === MPIN_LENGTH && confirmPin.length === MPIN_LENGTH);

  function typePin(next: string) {
    if (error) setError(null);
    if (pinField === 'pin') {
      setNewPin(next);
      // Straight on to the confirmation once four digits are in.
      if (next.length === MPIN_LENGTH) setPinField('confirm');
    } else {
      setConfirmPin(next);
    }
  }

  function clearPins() {
    setNewPin('');
    setConfirmPin('');
    setPinField('pin');
  }

  const dobValid = !dateOfBirth || (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && dateOfBirth <= isoToday());

  async function handleSave(grant?: string) {
    if (!fullName.trim()) return;
    setError(null);
    if (askPin && !pinSaved) {
      if (newPin.length !== MPIN_LENGTH) {
        setError('Choose a 4-digit PIN.');
        return;
      }
      if (newPin !== confirmPin) {
        setError('The two PINs do not match. Please type the confirmation again.');
        setConfirmPin('');
        setPinField('confirm');
        return;
      }
    }
    setSaving(true);
    try {
      if (askPin && !pinSaved) {
        try {
          await pin.setPin(newPin, grant);
          setPinSaved(true);
        } catch (err) {
          const data = (err as { response?: { data?: { otp_required?: boolean; detail?: unknown } } })?.response?.data;
          if (data?.otp_required) {
            setReverify(true);
            return;
          }
          setError(typeof data?.detail === 'string' ? data.detail : 'Could not set your PIN. Please try again.');
          return;
        }
      }
      await profilesApi.create({
        full_name: fullName.trim(),
        relation: 'self',
        // Blank optional fields are omitted rather than sent empty: a bare
        // '' fails DateField parsing server-side.
        ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
        ...(gender ? { gender } : {}),
        ...(bloodGroup ? { blood_group: bloodGroup } : {}),
      });
      await refreshProfiles();
      router.replace('/(patient)/(tabs)');
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (reverify && account) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.scroll, { alignItems: 'center' }]}>
          <OtpStep
            phone={account.phone_number}
            onVerified={async (data) => {
              setReverify(false);
              await handleSave(data.grant);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.xl}
      >
        <View style={styles.inner}>
          <View>
            <Text style={type.h1}>{askPin ? 'Create your account' : 'Set up your profile'}</Text>
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              {askPin
                ? 'Your details, and a 4-digit PIN you will use to sign in on any device.'
                : 'This is your own record. You can add family members later — each one keeps their documents, medicines and insurance separately.'}
            </Text>
          </View>

          <Card>
            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Priya Sharma"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="done"
            />

            <DateField
              label="Date of birth (optional)"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              placeholder="Pick your date of birth"
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
            />
            {!dobValid && (
              <Text style={styles.fieldError}>
                Enter a real past date in YYYY-MM-DD form.
              </Text>
            )}

            <Text style={styles.groupLabel}>Gender (optional)</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value}
                  onPress={() => setGender((v) => (v === g.value ? '' : g.value))}
                  style={[styles.chip, gender === g.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Blood group (optional)</Text>
            <View style={styles.chipRow}>
              {BLOOD_GROUPS.map((b) => (
                <Pressable
                  key={b}
                  onPress={() => setBloodGroup((v) => (v === b ? '' : b))}
                  style={[styles.chip, bloodGroup === b && styles.chipActive]}
                >
                  <Text style={[styles.chipText, bloodGroup === b && styles.chipTextActive]}>{b}</Text>
                </Pressable>
              ))}
            </View>

            {askPin && (
              <View style={styles.pinSection}>
                <Text style={styles.pinTitle}>Set your 4-digit PIN</Text>
                <Text style={[type.caption, { marginBottom: spacing.md }]}>
                  You will sign in with your number and this PIN on any device.
                </Text>
                {pinSaved ? (
                  <Text style={[type.caption, { color: colors.success, fontWeight: '600' }]}>PIN saved.</Text>
                ) : (
                  <>
                    <Pressable
                      onPress={() => setPinField('pin')}
                      style={[styles.pinRow, pinField === 'pin' && styles.pinRowActive]}
                      accessibilityLabel="PIN"
                    >
                      <Text style={styles.pinRowLabel}>PIN</Text>
                      <MpinDots filled={newPin.length} />
                    </Pressable>
                    <Pressable
                      onPress={() => newPin.length === MPIN_LENGTH && setPinField('confirm')}
                      style={[styles.pinRow, pinField === 'confirm' && styles.pinRowActive]}
                      accessibilityLabel="Confirm PIN"
                    >
                      <Text style={styles.pinRowLabel}>Confirm PIN</Text>
                      <MpinDots filled={confirmPin.length} error={pinMismatch} />
                    </Pressable>
                    {pinMismatch && <Text style={styles.pinError}>The PINs do not match.</Text>}
                    <MpinKeypad
                      value={pinField === 'pin' ? newPin : confirmPin}
                      onChange={typePin}
                      disabled={saving}
                    />
                    {(newPin.length > 0 || confirmPin.length > 0) && (
                      <Pressable onPress={clearPins} hitSlop={8} style={{ alignSelf: 'center', marginTop: spacing.sm }}>
                        <Text style={[type.caption, { color: colors.ink500, textDecorationLine: 'underline' }]}>
                          Clear PIN
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            )}

            {!!error && (
              <View style={{ marginBottom: spacing.md }}>
                <ErrorNote message={error} />
              </View>
            )}

            <Button
              onPress={() => handleSave()}
              disabled={!fullName.trim() || !dobValid || !pinReady}
              loading={saving}
            >
              {askPin ? 'Create account' : 'Continue'}
            </Button>
          </Card>

          <ModeSwitchCard />

          {/* Signed in with the wrong number? Without this the only way out
              was to close the app. */}
          <Pressable onPress={confirmLogout} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text style={[type.caption, { color: colors.ink500, textDecorationLine: 'underline' }]}>
              Not you? Sign out
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.lg },
  groupLabel: { ...type.caption, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, color: colors.ink700, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  fieldError: { ...type.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
  pinSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  pinTitle: { ...type.body, fontWeight: '700', color: colors.ink900, marginBottom: 2 },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pinRowActive: { borderColor: colors.brandPurple, backgroundColor: colors.surface },
  pinRowLabel: { ...type.caption, color: colors.ink700, fontWeight: '600' },
  pinError: { ...type.caption, color: colors.danger, marginBottom: spacing.sm },
});
