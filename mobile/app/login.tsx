import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import BeatingHeart from '../src/components/BeatingHeart';
import { RecordsArt } from '../src/components/Illustrations';
import PhoneInput, { isValidPhone, toE164 } from '../src/components/PhoneInput';
import { Button, Card, ErrorNote, Input } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getApiBaseUrl, IS_PRODUCTION, setApiBaseUrl } from '../src/lib/config';
import { storeApiBaseUrl } from '../src/lib/tokens';
import { colors, radius, spacing, type } from '../src/theme';
import { useConfirmExit } from '../src/lib/useBackHandler';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/** Mirrors the backend's OTP_TTL_MINUTES in accounts/services.py. */
const OTP_TTL_SECONDS = 10 * 60;

/** After this long, say the server is waking up rather than look frozen. */
const SLOW_REQUEST_MS = 6000;

function describeError(err: unknown, fallback: string) {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> }; message?: string };
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (status === 429) return 'Too many OTP requests. Try again in a little while.';
  if (status === 400) return 'That code was not right. Check it and try again.';
  if (!e?.response) {
    return IS_PRODUCTION
      ? "Couldn't reach CuraPath. Check your internet connection and try again."
      : "Couldn't reach the server. Check that the backend is running and that this phone is on the same network.";
  }
  return fallback;
}

export default function Login() {
  const { sendOtp, verifyOtp } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  // Back on the code screen returns to the phone number, like the on-screen
  // arrow; back on the phone screen asks before closing the app.
  useConfirmExit(() => {
    if (step !== 'otp') return false;
    setStep('phone');
    return true;
  });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const [showConnection, setShowConnection] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(getApiBaseUrl());

  const otpInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);

  const { width, height } = useWindowDimensions();
  // Flips on keyboardWillShow (Android included), so the compact layout
  // below lands while the keyboard is still sliding in, not after it.
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  const [slow, setSlow] = useState(false);

  // A free-tier server sleeps when idle and takes a while to answer the
  // first request; say so instead of leaving a spinner that looks stuck.
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), SLOW_REQUEST_MS);
    return () => clearTimeout(id);
  }, [busy]);

  // One ticker drives both the resend cooldown and the code's real expiry,
  // so the screen can never claim a code is still valid after the backend
  // has stopped accepting it.
  useEffect(() => {
    if (step !== 'otp') return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const fullNumber = toE164(phone);

  async function handleSendOtp(isResend = false) {
    if (busy) return;
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      const result = await sendOtp(fullNumber);
      setDebugOtp(result.debug_otp ?? null);
      setOtp('');
      setSecondsLeft(RESEND_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      if (!isResend) setStep('otp');
      setTimeout(() => otpInputRef.current?.focus(), 250);
    } catch (err) {
      setError(describeError(err, "Couldn't send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(code: string) {
    if (code.length !== OTP_LENGTH || busy) return;
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(fullNumber, code);
      // The index route reads the freshly loaded session and decides which
      // portal this account belongs to — this screen deliberately does not
      // duplicate that decision.
      router.replace('/');
    } catch (err) {
      setError(describeError(err, 'That code did not work. Please try again.'));
      setOtp('');
    } finally {
      setBusy(false);
    }
  }

  async function saveBaseUrl() {
    const trimmed = baseUrlDraft.trim();
    setApiBaseUrl(trimmed || null);
    await storeApiBaseUrl(trimmed || null);
    setShowConnection(false);
    setError(null);
  }

  const phoneReady = isValidPhone(phone);

  // The illustration and tagline are decoration: drop them while typing and
  // on short screens, so the heading, field and button all fit above the
  // keyboard. While typing the logo collapses to a single row.
  const showHero = step === 'phone' && !keyboardOpen && height >= 700;
  const heroWidth = Math.min(200, width * 0.5, height * 0.22);
  const compact = keyboardOpen || height < 560;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* The view shrinks to the space above the keyboard and the centred
          content re-centres in it. A KeyboardAwareScrollView here scrolled to
          the field before the compact layout took effect, so the shorter page
          stayed scrolled past its top — heading cut off, a gap above the keys. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={[styles.brandBlock, compact && styles.brandBlockCompact]}>
              {showHero && (
                <Animated.View entering={FadeIn.duration(220)} style={styles.hero}>
                  <RecordsArt width={heroWidth} />
                </Animated.View>
              )}
              <BeatingHeart size={compact ? 32 : 56} halo={!compact} />
              <Text style={[styles.brandName, compact && styles.brandNameCompact]}>CuraPath</Text>
              {!compact && (
                <Animated.Text entering={FadeIn.duration(220)} style={styles.brandTag}>
                  Your family's health records, insurance and medicines in one place.
                </Animated.Text>
              )}
            </View>

            <Card>
              {step === 'phone' ? (
                <>
                  <Text style={type.h2}>Sign in</Text>
                  <Text style={[type.caption, styles.stepNote]}>
                    We'll text you a 6-digit code. The same number works for patients, doctors and
                    staff — your account decides what you see.
                  </Text>
                  <PhoneInput
                    ref={phoneInputRef}
                    label="Mobile number"
                    value={phone}
                    onChangeText={(digits) => {
                      setPhone(digits);
                      if (error) setError(null);
                    }}
                    returnKeyType="go"
                    onSubmitEditing={() => phoneReady && handleSendOtp()}
                  />
                  <Button onPress={() => handleSendOtp()} disabled={!phoneReady} loading={busy}>
                    Send code
                  </Button>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setStep('phone');
                      setError(null);
                      setTimeout(() => phoneInputRef.current?.focus(), 250);
                    }}
                    style={styles.backRow}
                    hitSlop={12}
                  >
                    <Feather name="arrow-left" size={15} color={colors.ink500} />
                    <Text style={type.caption}>
                      {fullNumber.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2')}
                    </Text>
                    <Text style={styles.changeLink}>Change</Text>
                  </Pressable>

                  <Text style={type.h2}>Enter the code</Text>
                  <Text style={[type.caption, styles.stepNote]}>
                    {expiresIn > 0
                      ? `This code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}.`
                      : 'That code has expired — send a new one.'}
                  </Text>

                  <Pressable onPress={() => otpInputRef.current?.focus()}>
                    <View style={styles.otpRow}>
                      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.otpCell,
                            !!otp[i] && styles.otpCellFilled,
                            otp.length === i && styles.otpCellActive,
                          ]}
                        >
                          <Text style={styles.otpDigit}>{otp[i] ?? ''}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>

                  {/* One hidden field backs all six boxes — native keyboards
                      handle SMS autofill and backspace correctly on a single
                      input, and fight six separate ones. */}
                  <TextInput
                    ref={otpInputRef}
                    value={otp}
                    onChangeText={(text) => {
                      const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
                      setOtp(digits);
                      if (error) setError(null);
                      if (digits.length === OTP_LENGTH) handleVerify(digits);
                    }}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    // No maxLength: an SMS autofill or paste can carry extra
                    // characters, and onChangeText trims to six digits.
                    style={styles.hiddenInput}
                    autoFocus
                  />

                  {!!debugOtp && (
                    <View style={styles.debugChip}>
                      <Feather name="info" size={13} color={colors.info} />
                      <Text style={styles.debugText}>
                        Development code: <Text style={{ fontWeight: '700' }}>{debugOtp}</Text>
                      </Text>
                    </View>
                  )}

                  <Button onPress={() => handleVerify(otp)} disabled={otp.length !== OTP_LENGTH} loading={busy}>
                    Verify
                  </Button>

                  <Pressable
                    onPress={() => secondsLeft === 0 && handleSendOtp(true)}
                    disabled={secondsLeft > 0 || busy}
                    style={styles.resend}
                    hitSlop={12}
                  >
                    <Text style={[type.caption, secondsLeft === 0 && styles.resendActive]}>
                      {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </>
              )}

              {busy && slow && (
                <Text style={[type.caption, styles.slowNote]}>
                  Waking up the server — this can take up to a minute the first time.
                </Text>
              )}

              {!!error && (
                <View style={{ marginTop: spacing.md }}>
                  <ErrorNote message={error} />
                </View>
              )}
            </Card>

            {/* The server-address panel is a development aid; someone using
                the release build has no address to type in. */}
            {!IS_PRODUCTION && (
              <Pressable onPress={() => setShowConnection((v) => !v)} style={styles.connToggle}>
                <Feather name="wifi" size={13} color={colors.ink500} />
                <Text style={type.caption}>Can't connect?</Text>
              </Pressable>
            )}

            {!IS_PRODUCTION && showConnection && (
              <Card>
                <Text style={type.title}>Server address</Text>
                <Text style={[type.caption, styles.stepNote]}>
                  This phone reaches the backend at the address below. If your computer and phone are
                  on different networks, or the Django server is bound to a different host, set it
                  here.
                </Text>
                <Input
                  value={baseUrlDraft}
                  onChangeText={setBaseUrlDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="http://192.168.1.7:8000/api"
                />
                <Button onPress={saveBaseUrl} variant="secondary">
                  Save address
                </Button>
                <Text style={[type.micro, { marginTop: spacing.sm }]}>
                  Start Django with: python manage.py runserver 0.0.0.0:8000
                </Text>
              </Card>
            )}

            <View style={styles.securityRow}>
              <Feather name="shield" size={13} color={colors.ink300} />
              <Text style={[type.micro, { flexShrink: 1, textAlign: 'center' }]}>
                Your records are private and only visible to you.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  // Caps the form's width on tablets and landscape so it doesn't stretch edge to edge.
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.md },
  brandBlock: { alignItems: 'center', marginBottom: spacing.lg },
  brandBlockCompact: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  brandNameCompact: { fontSize: 22, marginTop: 0 },
  hero: { marginBottom: spacing.sm },
  brandName: { ...type.h1, marginTop: spacing.md },
  brandTag: {
    ...type.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  stepNote: { marginTop: spacing.xs, marginBottom: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  changeLink: { fontSize: 12, fontWeight: '600', color: colors.brandPurple, marginLeft: 2 },
  // Cells share the row's width, so six always fit — a 320dp phone included.
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  otpCell: {
    flex: 1,
    maxWidth: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellFilled: { borderColor: colors.ink300, backgroundColor: colors.card },
  otpCellActive: { borderColor: colors.brandPurple, backgroundColor: colors.brandLavender },
  otpDigit: { fontSize: 22, fontWeight: '700', color: colors.ink900 },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  debugChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.infoBg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  debugText: { fontSize: 12, color: colors.info, flexShrink: 1 },
  resend: { alignItems: 'center', marginTop: spacing.md, paddingVertical: spacing.xs },
  slowNote: { textAlign: 'center', marginTop: spacing.md },
  resendActive: { color: colors.brandPurple, fontWeight: '600' },
  connToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
});
