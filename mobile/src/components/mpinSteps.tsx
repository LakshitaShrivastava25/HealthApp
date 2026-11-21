import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import MpinKeypad, { MPIN_LENGTH, MpinDots } from './MpinKeypad';
import { Button } from './ui';
import { authApi, mpinApi } from '../lib/api';
import { maskPhone } from '../lib/pin';
import { colors, spacing, type } from '../theme';

/**
 * The two steps shared by the sign-in screen's Forgot PIN flow and the
 * setup route: verify a number by code, and choose a PIN twice.
 *
 * Components rather than routes, because both callers need them inline —
 * the sign-in screen swaps them in place of its own card rather than
 * pushing a screen and losing the number already typed.
 */

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export type GrantResult = { grant: string; access: string; refresh: string };

/** Send a code to the account's number and exchange it for a grant. */
export function OtpStep({
  phone,
  onVerified,
  onCancel,
}: {
  phone: string;
  onVerified: (data: GrantResult) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [left, setLeft] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.sendOtp(phone);
      setSent(true);
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setTimeout(() => inputRef.current?.focus(), 250);
    } catch (err) {
      setError(describe(err, 'Could not send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    if (code.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await mpinApi.grant(phone, code);
      await onVerified(data);
    } catch (err) {
      setError(describe(err, "That code isn't right. Check it and try again."));
      setOtp('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.step}>
      <Text style={styles.title}>Verify your number</Text>
      <Text style={styles.sub}>
        {sent ? `Enter the 6-digit code sent to ${maskPhone(phone)}` : `We'll text a code to ${maskPhone(phone)}`}
      </Text>

      {sent && (
        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={(next) => {
            const digits = next.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
            setOtp(digits);
            if (digits.length === OTP_LENGTH) void verify(digits);
          }}
          keyboardType="number-pad"
          // An SMS code is exactly what autofill is for — unlike the PIN.
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={OTP_LENGTH}
          style={styles.otpInput}
          accessibilityLabel="One-time code"
        />
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!sent ? (
        <Button onPress={send} loading={busy}>Send code</Button>
      ) : (
        <Pressable onPress={left > 0 ? undefined : send} disabled={left > 0}>
          <Text style={[styles.link, left > 0 && { color: colors.ink300 }]}>
            {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
          </Text>
        </Pressable>
      )}

      {!!onCancel && (
        <Pressable onPress={onCancel}>
          <Text style={styles.quiet}>Back</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Choose a PIN, then type it again. */
export function ChooseStep({
  title = 'Choose a PIN',
  /** Let a caller that already shows a heading avoid a second one. */
  hideHeader = false,
  onDone,
}: {
  title?: string;
  hideHeader?: boolean;
  onDone: (mpin: string) => Promise<void>;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirming = first.length === MPIN_LENGTH;
  const value = confirming ? second : first;

  useEffect(() => {
    if (second.length !== MPIN_LENGTH || busy) return;
    if (second !== first) {
      setError('Those PINs did not match. Try again.');
      setFirst('');
      setSecond('');
      return;
    }
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await onDone(second);
      } catch (err) {
        // The server rejects guessable PINs; show its wording, which names
        // the actual reason rather than a generic failure.
        setError(describe(err, 'Could not set your PIN. Please try again.'));
        setFirst('');
        setSecond('');
      } finally {
        setBusy(false);
      }
    })();
  }, [second, first, busy, onDone]);

  return (
    <View style={styles.step}>
      {(!hideHeader || confirming) && (
        <>
          <Text style={styles.title}>{confirming ? 'Confirm your PIN' : title}</Text>
          <Text style={styles.sub}>
            {confirming ? 'Type it once more' : "You'll use this to sign in"}
          </Text>
        </>
      )}

      <View style={styles.dotsWrap}>
        <MpinDots filled={value.length} error={!!error} />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <MpinKeypad
        value={value}
        onChange={confirming ? setSecond : setFirst}
        disabled={busy}
      />

      {confirming && !busy && (
        <Pressable
          onPress={() => {
            setFirst('');
            setSecond('');
            setError(null);
          }}
        >
          <Text style={styles.quiet}>Start over</Text>
        </Pressable>
      )}
    </View>
  );
}

function describe(err: unknown, fallback: string) {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

const styles = StyleSheet.create({
  step: { width: '100%', maxWidth: 360, alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { ...type.h2 },
  sub: { ...type.caption, textAlign: 'center' },
  dotsWrap: { height: 28, justifyContent: 'center' },
  error: { ...type.caption, color: colors.danger, textAlign: 'center' },
  link: { ...type.body, color: colors.brandPurple, fontWeight: '600' },
  quiet: { ...type.caption, color: colors.ink500, textDecorationLine: 'underline' },
  otpInput: {
    width: 180,
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderColor: colors.brandPurple,
    color: colors.ink900,
  },
});
