import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import PhoneInput, { isValidPhone, localDigits, toE164 } from '../src/components/PhoneInput';
import { Button, Card, ErrorNote, Input } from '../src/components/ui';
import { ChooseStep } from '../src/components/mpinSteps';
import MpinKeypad, { MpinDots } from '../src/components/MpinKeypad';
import { usePin } from '../src/context/PinContext';
import { getPinHint } from '../src/lib/pin';
import { useAuth } from '../src/context/AuthContext';
import { mpinApi } from '../src/lib/api';
import { getApiBaseUrl, IS_PRODUCTION, setApiBaseUrl } from '../src/lib/config';
import { storeApiBaseUrl } from '../src/lib/tokens';
import { colors, radius, spacing, type } from '../src/theme';
import { useConfirmExit } from '../src/lib/useBackHandler';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/** After this long, say the server is waking up rather than look frozen. */
const SLOW_REQUEST_MS = 6000;

type ApiError = {
  response?: { status?: number; data?: Record<string, unknown> };
  message?: string;
  code?: string;
};

/**
 * Axios reports a timeout as a plain "no response" error, which is also what
 * a dead network looks like — so without this check the one case where the
 * server is simply slow gets reported as the person's wifi being broken.
 */
function isTimeout(err: unknown) {
  const e = err as ApiError;
  return e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '');
}

/** The cooldown a 429 asks us to wait, in seconds, or 0 when it carries none. */
function retryAfterSeconds(err: unknown): number {
  const e = err as ApiError;
  if (e?.response?.status !== 429) return 0;
  const value = e.response?.data?.retry_after;
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : 0;
}

/** True when the code itself was judged — not when the server or network failed. */
function isCodeRejected(err: unknown) {
  const status = (err as ApiError)?.response?.status;
  return status === 400 || status === 429;
}

// The backend's `detail` is written for people and wins; the rest only
// covers responses that arrive without one.
/** "4:32" — a wait someone can read, not a count of seconds in prose. */
function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, '0');
  return m > 0 ? `${m}:${sec}` : `${seconds}s`;
}

function describeError(err: unknown, action: 'send' | 'verify') {
  const e = err as ApiError;
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (isTimeout(err)) {
    // Deliberately not "check your connection": the request went out and the
    // server simply did not answer in time, so telling someone with working
    // internet to check their internet sends them looking in the wrong place.
    return 'The server took too long to answer. Tap Try again.';
  }
  if (!e?.response) {
    return IS_PRODUCTION
      ? "Couldn't reach CuraPath. Check your internet connection and try again."
      : "Couldn't reach the server. Check that the backend is running and that this phone is on the same network.";
  }
  if (action === 'send') {
    if (status === 429) return 'Too many OTP requests. Try again in a little while.';
    if (status === 400) return 'Check the mobile number and try again.';
    return "Couldn't send the code. Please try again.";
  }
  if (status === 429) return 'Too many wrong attempts. Tap Resend to get a new code.';
  if (status === 400) return "That code isn't right. Check it and try again.";
  return "Couldn't check the code right now. Please try again.";
}

export default function Login() {
  const { sendOtp, verifyOtp, adoptSession } = useAuth();
  const router = useRouter();

  /**
   * One path, one action per screen.
   *
   * A code is never an alternative to the PIN. It appears in exactly two
   * places: registering a phone that has not been used here before, and
   * resetting a PIN nobody can remember. Offering both as ways to sign in
   * is what made this screen confusing.
   */
  const [step, setStep] = useState<'phone' | 'pin' | 'otp' | 'set-pin'>('phone');
  const [mpin, setMpin] = useState('');
  /** True while the code being entered is for resetting a forgotten PIN. */
  const [resetting, setResetting] = useState(false);
  /** Single-use proof from a verified code, spent when the new PIN is set. */
  const [grant, setGrant] = useState('');
  /**
   * The number this phone is registered to, if any.
   *
   * Read locally and never asked of the server: a "does this number have a
   * PIN?" endpoint would answer "is this number registered?" for anyone who
   * cared to ask, which is the enumeration the unlock endpoint already goes
   * out of its way to prevent.
   */
  const [knownPhone, setKnownPhone] = useState<string | null>(null);

  // Back on the code screen returns to the phone number, like the on-screen
  // arrow; back on the phone screen asks before closing the app.
  useConfirmExit(() => {
    // Setting a first PIN is required, so back must not escape it.
    if (step === 'phone' || step === 'set-pin') return false;
    setStep('phone');
    setError(null);
    return true;
  });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A timestamp rather than a counter: timers pause while the app is in the
  // background (the user reading the SMS), and the clock does not.
  const [resendAt, setResendAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [showConnection, setShowConnection] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(getApiBaseUrl());

  const otpInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);

  const { width, height } = useWindowDimensions();
  // Flips on keyboardWillShow (Android included), so the compact layout
  // below lands while the keyboard is still sliding in, not after it.
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  const pin = usePin();
  const [slow, setSlow] = useState(false);

  // A free-tier server sleeps when idle and takes a while to answer the
  // first request; say so instead of leaving a spinner that looks stuck.
  useEffect(() => {
    void getPinHint().then((hint) => {
      if (!hint?.phone) return;
      setKnownPhone(localDigits(hint.phone));
      // Prefilled so a returning person taps one button rather than
      // retyping a number this phone already knows.
      setPhone((current) => current || localDigits(hint.phone));
    });
  }, []);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), SLOW_REQUEST_MS);
    return () => clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    if (step !== 'otp') return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, resendAt]);

  const fullNumber = toE164(phone);

  async function handleSendOtp(isResend = false) {
    if (busy) return;
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      const result = await sendOtp(fullNumber);
      // Only a development backend includes this. A release build never
      // shows it, so a misconfigured server fails loudly instead of quietly
      // handing out codes.
      setDebugOtp(__DEV__ ? (result.debug_otp ?? null) : null);
      setOtp('');
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setSecondsLeft(RESEND_SECONDS);
      if (!isResend) setStep('otp');
      setTimeout(() => otpInputRef.current?.focus(), 250);
    } catch (err) {
      setError(describeError(err, 'send'));
      // A 429 carries the server's own countdown. Without this the "Resend
      // code in Ns" timer only ever starts on success, so someone who was
      // rate-limited sees a bare error and taps again into the same wall.
      const retryAfter = retryAfterSeconds(err);
      if (retryAfter) {
        setResendAt(Date.now() + retryAfter * 1000);
        setSecondsLeft(retryAfter);
        if (!isResend) setStep('otp');
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sign in with the number and its PIN, no code. The server enrols this
   * phone on success, so later unlocks are device-bound.
   */
  /**
   * The one decision this screen makes: a phone that is already registered
   * goes to its PIN, anything else gets a code to register with.
   */
  function handleContinue() {
    if (!phoneReady || busy) return;
    setError(null);
    if (pinFirst) {
      setMpin('');
      setStep('pin');
      return;
    }
    setResetting(false);
    void handleSendOtp();
  }

  async function handlePinSignIn(code: string) {
    if (code.length !== 4 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await pin.signInWithPin(fullNumber, code);
      if (ok) router.replace('/');
      else setMpin('');
    } finally {
      setBusy(false);
    }
  }

  /** Forgot PIN: the same code flow, but it ends at "choose a new PIN". */
  function handleForgotPin() {
    setError(null);
    setResetting(true);
    setMpin('');
    void handleSendOtp();
  }

  async function handleVerify(code: string) {
    if (code.length !== OTP_LENGTH || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (resetting) {
        // Resetting a forgotten PIN: trade the code for a grant, then let
        // them choose a new one. The grant also signs them in, so there is
        // no second login after this.
        const { data } = await mpinApi.grant(fullNumber, code);
        // The grant comes with a token pair, and setting the new PIN is an
        // authenticated call — without adopting the session first it goes
        // out with no Authorization header and the server refuses it.
        await adoptSession(data.access, data.refresh);
        setGrant(data.grant);
        setStep('set-pin');
        return;
      }
      const account = await verifyOtp(fullNumber, code);
      if (account.has_mpin) {
        // They already have a PIN; this code was only to register the
        // phone. Do that quietly — their usual PIN works here from now on.
        await pin.registerDevice().catch(() => undefined);
      } else {
        // No PIN yet. Setting one is required, so go straight there rather
        // than letting them reach the app and be asked later.
        setStep('set-pin');
        return;
      }
      // The index route reads the freshly loaded session and decides which
      // portal this account belongs to — this screen deliberately does not
      // duplicate that decision.
      router.replace('/');
    } catch (err) {
      setError(describeError(err, 'verify'));
      // A server or network failure says nothing about the code, so keep it
      // in the boxes for another tap on Verify.
      if (isCodeRejected(err)) setOtp('');
    } finally {
      setBusy(false);
    }
  }

  async function saveBaseUrl() {
    const trimmed = baseUrlDraft.trim();
    if (trimmed && !/^https?:\/\/[^\s/]+/i.test(trimmed)) {
      setError('Enter a full address starting with http:// or https://');
      return;
    }
    setApiBaseUrl(trimmed || null);
    await storeApiBaseUrl(trimmed || null);
    setShowConnection(false);
    setError(null);
  }

  const phoneReady = isValidPhone(phone);

  /**
   * Seconds still to wait, counted from the server's own deadline so a
   * changed device clock cannot shorten it. Covers both the per-account
   * lockout and DRF's throttle — the person only needs to know how long.
   */
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!pin.waitUntil) {
      setWaitSeconds(0);
      return;
    }
    const tick = () => setWaitSeconds(Math.max(0, Math.ceil((pin.waitUntil! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pin.waitUntil]);
  /**
   * Whether the PIN leads on this screen.
   *
   * True only when this phone has signed in before *and* the number on
   * screen is still that one. Typing a different number means the PIN on
   * file belongs to someone else's account, so offering it would only buy
   * a confusing 401.
   */
  const pinFirst = !!knownPhone && localDigits(phone) === knownPhone;

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
              {/* Gated on !compact alongside the descriptive line below it.
                  The compact layout exists because the keyboard leaves very
                  little height (it also triggers under 560px), and another
                  line there risks pushing the field and button out of reach —
                  the one failure this screen cannot afford. */}
              {!compact && (
                <Animated.Text entering={FadeIn.duration(220)} style={styles.brandSlogan}>
                  Technology for Better Care
                </Animated.Text>
              )}
              {!compact && (
                <Animated.Text entering={FadeIn.duration(220)} style={styles.brandTag}>
                  Your family's health records, insurance and medicines in one place.
                </Animated.Text>
              )}
            </View>

            <Card>
              {step === 'phone' ? (
                <>
                  <Text style={type.h2}>{pinFirst ? 'Welcome back' : 'Sign in'}</Text>
                  <Text style={[type.caption, styles.stepNote]}>
                    {pinFirst
                      ? 'Enter your PIN to sign in. Forgot it? You can reset it on the next screen.'
                      : "We'll text you a 6-digit code. Doctors sign in here too, then register from More → Register as a doctor and switch between User and Doctor mode."}
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
                    onSubmitEditing={handleContinue}
                  />
                  <Button onPress={handleContinue} disabled={!phoneReady} loading={busy}>
                    {pinFirst ? 'Continue' : 'Send code'}
                  </Button>
                </>
              ) : step === 'pin' ? (
                <>
                  <Pressable
                    onPress={() => { setStep('phone'); setError(null); setMpin(''); }}
                    style={styles.backRow}
                    hitSlop={12}
                  >
                    <Feather name="arrow-left" size={15} color={colors.ink500} />
                    <Text style={type.caption}>
                      {fullNumber.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2')}
                    </Text>
                    <Text style={styles.changeLink}>Change</Text>
                  </Pressable>
                  <Text style={type.h2}>Enter your PIN</Text>
                  <Text style={[type.caption, styles.stepNote]}>
                    The 4-digit PIN you set for CuraPath.
                  </Text>
                  <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    {busy ? (
                      <ActivityIndicator color={colors.brandPurple} />
                    ) : (
                      <MpinDots filled={mpin.length} error={!!error} />
                    )}
                    <MpinKeypad
                      value={mpin}
                      onChange={(next) => {
                        setMpin(next);
                        if (error) setError(null);
                        if (next.length === 4) void handlePinSignIn(next);
                      }}
                      disabled={busy || waitSeconds > 0}
                    />
                  </View>

                  {waitSeconds > 0 && (
                    <Text style={styles.waitNote}>
                      Too many attempts. Try again in {formatWait(waitSeconds)}.
                    </Text>
                  )}
                  {pin.attemptsLeft != null && pin.attemptsLeft > 0 && !error && waitSeconds === 0 && (
                    <Text style={[type.caption, { textAlign: 'center' }]}>
                      {pin.attemptsLeft} {pin.attemptsLeft === 1 ? 'try' : 'tries'} left
                    </Text>
                  )}

                  {pin.biometric.enabled && waitSeconds === 0 && (
                    <Pressable
                      onPress={async () => {
                        if (await pin.signInWithBiometrics()) router.replace('/');
                      }}
                      style={styles.pinLinkRow}
                      disabled={busy}
                    >
                      <Feather name="unlock" size={14} color={colors.brandPurple} />
                      <Text style={styles.pinLink}>Use {pin.biometric.label}</Text>
                    </Pressable>
                  )}

                  {/* The only other way off this screen. A code resets the
                      PIN — it is never a second way to sign in. */}
                  <Pressable onPress={handleForgotPin} style={styles.pinLinkRow} disabled={busy}>
                    <Text style={styles.pinLink}>Forgot PIN?</Text>
                  </Pressable>
                </>
              ) : step === 'set-pin' ? (
                <>
                  <Text style={type.h2}>
                    {resetting ? 'Set a new PIN' : 'Create your PIN'}
                  </Text>
                  <Text style={[type.caption, styles.stepNote]}>
                    {resetting
                      ? 'Choose a new 4-digit PIN for CuraPath.'
                      : "You'll use this to sign in from now on, instead of waiting for a code."}
                  </Text>
                  <View style={{ marginTop: spacing.sm }}>
                    <ChooseStep
                      title={resetting ? 'Set a new PIN' : 'Create your PIN'}
                      hideHeader
                      onDone={async (next) => {
                        await pin.setPin(next, grant || undefined);
                        setGrant('');
                        setResetting(false);
                        router.replace('/');
                      }}
                    />
                  </View>
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
                    Enter the 6-digit code we texted you.
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

                  {__DEV__ && !!debugOtp && (
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

              {!!(error || (step === 'pin' && pin.error)) && (
                <View style={{ marginTop: spacing.md }}>
                  {/* Retrying is the whole point of showing this: a failed
                      send with no way to try again is the dead end App
                      Review hit. Suppressed while a cooldown is counting
                      down, when another tap can only fail the same way. */}
                  <ErrorNote
                    message={error ?? pin.error ?? ''}
                    onRetry={
                      busy || secondsLeft > 0
                        ? undefined
                        : step === 'phone'
                          ? () => handleSendOtp()
                          : otp.length === OTP_LENGTH
                            ? () => handleVerify(otp)
                            : () => handleSendOtp(true)
                    }
                  />
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
  brandSlogan: { ...type.label, textAlign: 'center', marginTop: spacing.xs },
  brandTag: {
    ...type.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  stepNote: { marginTop: spacing.xs, marginBottom: spacing.lg },
  pinLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  pinLink: { ...type.body, color: colors.brandPurple, fontWeight: '600' },
  waitNote: { ...type.caption, color: colors.danger, textAlign: 'center' },
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
