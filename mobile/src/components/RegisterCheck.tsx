import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { doctorApi, type RegisterCheck as CheckResult } from '../lib/api';
import { colors, radius, spacing, type } from '../theme';

/**
 * The "Verify" button: looks the registration up on the NMC register before
 * the doctor submits, and shows what the register has. It never blocks
 * submission — an admin reviews every registration, whatever this says.
 * Same behaviour as the website's RegisterCheck.
 */
export default function RegisterCheck({
  registrationNumber,
  councilId,
  year,
  fullName,
}: {
  registrationNumber: string;
  councilId: string;
  year?: string;
  fullName?: string;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = registrationNumber.trim() !== '' && councilId !== '';

  async function check() {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await doctorApi.verifyRegistration({
        registration_number: registrationNumber.trim(),
        state_council_id: councilId,
        registration_year: year ? Number(year) : null,
        full_name: fullName?.replace(/^dr(\.\s*|\s+)/i, '').trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 429
          ? 'Too many checks in a minute — wait a moment and try again.'
          : "We couldn't reach the medical register right now — your registration will be verified shortly."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={[type.caption, { flex: 1 }]}>Check your number on the NMC Indian Medical Register (optional).</Text>
        <Pressable
          onPress={check}
          disabled={!ready || checking}
          accessibilityRole="button"
          style={[styles.button, (!ready || checking) && { opacity: 0.5 }]}
        >
          {checking ? (
            <ActivityIndicator size="small" color={colors.brandPurple} />
          ) : (
            <Feather name="search" size={13} color={colors.brandPurple} />
          )}
          <Text style={styles.buttonText}>{checking ? 'Checking…' : 'Verify'}</Text>
        </Pressable>
      </View>

      {!!error && <Line icon="wifi-off" color={colors.warning} text={error} />}

      {result && (
        <View style={{ marginTop: spacing.sm, gap: 4 }}>
          {result.status === 'found' ? (
            <>
              <Line
                icon={result.suspended ? 'alert-triangle' : 'check-circle'}
                color={result.suspended ? colors.danger : colors.success}
                text={result.suspended ? 'On the register, but listed as removed' : 'Found on the NMC register'}
                bold
              />
              <Text style={styles.fact}>
                <Text style={{ color: colors.ink500 }}>Name on register: </Text>
                {result.nmc_name || '—'}
                {result.name_matches !== null && (
                  <Text style={{ color: result.name_matches ? colors.success : colors.warning }}>
                    {result.name_matches ? ' · matches your name' : " · doesn't match the name you entered"}
                  </Text>
                )}
              </Text>
              <Text style={styles.fact}>
                <Text style={{ color: colors.ink500 }}>Qualification: </Text>
                {result.nmc_qualification || '—'}
                {result.nmc_university ? ` · ${result.nmc_university}` : ''}
              </Text>
            </>
          ) : (
            <Line
              icon={result.status === 'not_found' ? 'x-circle' : 'alert-triangle'}
              color={colors.warning}
              text={result.message}
            />
          )}
          <Text style={type.micro}>An admin reviews every registration before you can see patients.</Text>
        </View>
      )}
    </View>
  );
}

function Line({
  icon,
  color,
  text,
  bold,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  text: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Feather name={icon} size={13} color={color} style={{ marginTop: 2 }} />
      <Text style={[type.caption, { color, flex: 1 }, bold && { fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandLavender,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  buttonText: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm },
  fact: { ...type.caption, color: colors.ink700 },
});
