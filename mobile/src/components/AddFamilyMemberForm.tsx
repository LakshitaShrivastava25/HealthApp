import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import DateField from './DateField';
import { ALLERGY_KINDS, BLOOD_GROUPS, ChipSelect, GENDERS, LANGUAGES, RELATIONS } from './profileOptions';
import { Button, ErrorNote, Input, Row } from './ui';
import { allergiesApi, familyApi } from '../lib/api';
import { colors, radius, spacing, type } from '../theme';

type AllergyDraft = { kind: string; substance: string; reaction: string };

export function serverMessage(err: unknown, fallback: string) {
  const detail = (err as { response?: { data?: unknown } })?.response?.data;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const first = Object.values(detail as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

type Step = 'details' | 'otp' | 'done';

export default function AddFamilyMemberForm({
  onDone,
  onCancel,
}: {
  onDone: (warning?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('details');

  const [fullName, setFullName] = useState('');
  const [relation, setRelation] = useState('father');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [language, setLanguage] = useState('English');
  const [allergies, setAllergies] = useState<AllergyDraft[]>([]);

  const isChild = (relation === 'son' || relation === 'daughter') &&
    (dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : true);
  const phoneRequired = !isChild && relation !== 'self';

  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [hasExistingAccount, setHasExistingAccount] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAllergy(i: number, patch: Partial<AllergyDraft>) {
    setAllergies((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function handleSendOtp() {
    if (phoneRequired && !phoneNumber.trim()) {
      setError('Phone number is required for adult family members.');
      return;
    }
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    setError(null);

    if (!phoneNumber.trim()) {
      await handleCreateMember();
      return;
    }

    setOtpSending(true);
    try {
      const { data } = await familyApi.verifyPhone(phoneNumber.trim());
      if (!data.ok) {
        setError(data.error || 'Could not send OTP.');
        setOtpSending(false);
        return;
      }
      setHasExistingAccount(data.has_existing_account);
      setStep('otp');
    } catch {
      setError('Could not send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) return;
    setError(null);
    setOtpVerifying(true);
    try {
      const { data } = await familyApi.confirmPhone(phoneNumber.trim(), otp.trim());
      if (!data.verified) {
        const msgs: Record<string, string> = {
          wrong: 'Incorrect OTP. Please try again.',
          expired: 'OTP expired. Please request a new one.',
          locked: 'Too many attempts. Please request a new OTP.',
        };
        setError(msgs[data.result] || 'Verification failed.');
        setOtpVerifying(false);
        return;
      }
      await handleCreateMember();
    } catch {
      setError('Verification failed. Please try again.');
      setOtpVerifying(false);
    }
  }

  async function handleCreateMember() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        relation,
        ...(dob ? { date_of_birth: dob } : {}),
        ...(gender ? { gender } : {}),
        ...(bloodGroup ? { blood_group: bloodGroup } : {}),
        ...(phoneNumber.trim() ? { phone_number: phoneNumber.trim() } : {}),
        ...(heightCm.trim() ? { height_cm: Number(heightCm) } : {}),
        ...(weightKg.trim() ? { weight_kg: Number(weightKg) } : {}),
        preferred_language: language,
      };
      const { data } = await familyApi.createMember(payload);

      if (data.status === 'pending_approval') {
        setPendingApproval(true);
        setStep('done');
        return;
      }

      let failed = 0;
      for (const a of allergies) {
        if (!a.substance.trim()) continue;
        try {
          await allergiesApi.create({
            profile: data.id,
            kind: a.kind,
            substance: a.substance.trim(),
            reaction: a.reaction.trim(),
          });
        } catch {
          failed += 1;
        }
      }

      setSaving(false);
      await onDone(
        failed
          ? `${fullName.trim()} was added, but ${failed} ${failed === 1 ? 'allergy' : 'allergies'} couldn't be saved.`
          : undefined,
      );
    } catch (err) {
      setError(serverMessage(err, 'Could not add this family member. Please try again.'));
      setSaving(false);
      setOtpVerifying(false);
    }
  }

  async function handleResendOtp() {
    setOtp('');
    setError(null);
    setOtpSending(true);
    try {
      const { data } = await familyApi.verifyPhone(phoneNumber.trim());
      if (!data.ok) setError(data.error || 'Could not resend OTP.');
    } catch {
      setError('Could not resend OTP.');
    } finally {
      setOtpSending(false);
    }
  }

  if (step === 'done' && pendingApproval) {
    return (
      <View style={styles.doneContainer}>
        <Feather name="clock" size={40} color={colors.warning} />
        <Text style={[type.title, { marginTop: spacing.md, textAlign: 'center' }]}>Approval request sent</Text>
        <Text style={[type.micro, { textAlign: 'center', marginTop: spacing.sm }]}>
          The owner of {phoneNumber} needs to approve your request.
          Once approved, they'll appear in your family members.
        </Text>
        <Button style={{ marginTop: spacing.lg }} onPress={() => onDone()}>Done</Button>
      </View>
    );
  }

  if (step === 'otp') {
    return (
      <View style={{ marginTop: spacing.md }}>
        <View style={styles.otpBanner}>
          <Feather name="shield" size={20} color={colors.brandPurple} />
          <View style={{ flex: 1 }}>
            <Text style={type.label}>OTP sent to {phoneNumber}</Text>
            <Text style={type.micro}>
              {hasExistingAccount
                ? 'This number belongs to an existing user. After verification, an approval request will be sent to them.'
                : 'Enter the 6-digit code to verify this phone number.'}
            </Text>
          </View>
        </View>

        <Input
          label="Enter OTP"
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <Pressable onPress={handleResendOtp} disabled={otpSending} hitSlop={8}>
          <Text style={styles.resendText}>{otpSending ? 'Sending...' : 'Resend OTP'}</Text>
        </Pressable>

        {!!error && <ErrorNote message={error} />}

        <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => { setStep('details'); setError(null); }}
            disabled={otpVerifying}
          >
            Back
          </Button>
          <Button
            style={{ flex: 1 }}
            onPress={handleVerifyOtp}
            disabled={otpVerifying || otp.length < 6}
            loading={otpVerifying || saving}
          >
            Verify & Continue
          </Button>
        </Row>
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.md }}>
      <Input
        label="Full name *"
        value={fullName}
        onChangeText={setFullName}
        placeholder="e.g. Ramesh Sharma"
        autoCapitalize="words"
      />

      <ChipSelect label="Relation *" options={RELATIONS} value={relation} onChange={setRelation} />

      <Input
        label={phoneRequired ? 'Phone number *' : isChild ? 'Phone number (optional)' : 'Phone number'}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        placeholder="e.g. 9876543210"
        keyboardType="phone-pad"
      />

      <DateField
        label="Date of birth"
        value={dob}
        onChange={setDob}
        placeholder="Select date of birth"
        maximumDate={new Date()}
        minimumDate={new Date(1900, 0, 1)}
      />

      <ChipSelect label="Gender" options={GENDERS} value={gender} onChange={setGender} allowClear />
      <ChipSelect label="Blood group" options={BLOOD_GROUPS} value={bloodGroup} onChange={setBloodGroup} allowClear />

      <Row style={{ gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="170" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" placeholder="65" />
        </View>
      </Row>

      <ChipSelect label="Preferred language" options={LANGUAGES} value={language} onChange={setLanguage} />

      <View style={styles.allergyHeader}>
        <Text style={type.caption}>Allergies</Text>
        <Pressable
          onPress={() => setAllergies((l) => [...l, { kind: 'drug', substance: '', reaction: '' }])}
          hitSlop={8}
          style={styles.addAllergy}
        >
          <Feather name="plus" size={13} color={colors.brandPurple} />
          <Text style={styles.addAllergyText}>Add allergy</Text>
        </Pressable>
      </View>
      {allergies.length === 0 ? (
        <Text style={[type.micro, { marginBottom: spacing.md }]}>None recorded. You can add these later too.</Text>
      ) : (
        allergies.map((a, i) => (
          <View key={i} style={styles.allergyBox}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={type.label}>Allergy {i + 1}</Text>
              <Pressable
                onPress={() => setAllergies((l) => l.filter((_, idx) => idx !== i))}
                hitSlop={10}
                accessibilityLabel={`Remove allergy ${i + 1}`}
              >
                <Feather name="x" size={16} color={colors.ink500} />
              </Pressable>
            </Row>
            <ChipSelect options={ALLERGY_KINDS} value={a.kind} onChange={(kind) => updateAllergy(i, { kind })} />
            <Input
              value={a.substance}
              onChangeText={(substance) => updateAllergy(i, { substance })}
              placeholder="Substance (e.g. Penicillin)"
            />
            <Input
              value={a.reaction}
              onChangeText={(reaction) => updateAllergy(i, { reaction })}
              placeholder="Reaction (optional)"
            />
          </View>
        ))
      )}

      {!!error && <ErrorNote message={error} />}

      <Row style={{ gap: spacing.sm }}>
        <Button
          style={{ flex: 1 }}
          onPress={handleSendOtp}
          disabled={!fullName.trim()}
          loading={saving || otpSending}
        >
          {phoneNumber.trim() ? 'Verify & Add' : 'Add member'}
        </Button>
        <Button variant="secondary" style={{ flex: 1 }} onPress={onCancel} disabled={saving || otpSending}>
          Cancel
        </Button>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  allergyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addAllergy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addAllergyText: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
  allergyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  otpBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  resendText: {
    fontSize: 12,
    color: colors.brandPurple,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  doneContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
});
