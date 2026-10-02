import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { accessApi } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

/** A patient reference code: two letters then four digits, e.g. AB1234 —
 *  the shape family/models.py generates. The backend matches it
 *  case-insensitively (doctors/serializers.py ProfileReferenceCodeField). */
const CODE_RE = /^[A-Z]{2}\d{4}$/;
/** Legacy fallback the backend still accepts: the raw profile UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trimmed, and uppercased when it is a short code, so "ab1234 " works. */
function normalise(raw: string): string {
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : trimmed.toUpperCase();
}

export default function RequestAccess() {
  const { doctor } = useAuth();
  const router = useRouter();

  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reference = normalise(profileId);
  const looksValid = CODE_RE.test(reference) || UUID_RE.test(reference);

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setProfileId(text.trim());
  }

  async function handleSubmit() {
    if (!doctor || !looksValid) return;
    setError(null);
    setBusy(true);
    try {
      await accessApi.request(doctor.id, reference);
      setSuccess(true);
      setProfileId('');
      setTimeout(() => {
        setSuccess(false);
        router.push('/(doctor)/(tabs)');
      }, 1400);
    } catch (err) {
      const response = (
        err as { response?: { status?: number; data?: { detail?: string; profile?: string[] } } }
      )?.response;
      if (response?.data?.detail) {
        setError(response.data.detail);
      } else if (response?.data?.profile?.[0]) {
        // ProfileReferenceCodeField's message, e.g. "No patient found with that reference ID."
        setError(response.data.profile[0]);
      } else if (response?.status === 400) {
        // The backend enforces one grant per doctor-patient pair.
        setError(
          'That request could not be created. Either the reference ID is not a real patient, or you have already requested access to them.'
        );
      } else {
        setError("Couldn't send the request. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <CardHeader
          title="Request patient access"
          subtitle="Consent first — you see nothing until the patient approves."
        />

        <View style={styles.iconWrap}>
          <Feather name="user-plus" size={22} color={colors.brandTeal} />
        </View>

        <Text style={[type.caption, { marginBottom: spacing.lg }]}>
          Ask the patient to open Doctor Access in their app and read you their 6-character
          reference ID, e.g. AB1234. They receive your request and choose whether to approve it.
        </Text>

        <Input
          label="Patient reference ID"
          value={profileId}
          onChangeText={setProfileId}
          placeholder="AB1234"
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Row style={{ gap: spacing.sm }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={handlePaste}>
            Paste
          </Button>
          <Button style={{ flex: 1 }} onPress={handleSubmit} disabled={!looksValid} loading={busy}>
            Send request
          </Button>
        </Row>

        {!!profileId && !looksValid && (
          <Text style={styles.fieldError}>
            That does not look like a reference ID. It should be 6 characters, like AB1234.
          </Text>
        )}

        {success && (
          <Row style={styles.successRow}>
            <Feather name="check-circle" size={15} color={colors.success} />
            <Text style={[type.caption, { color: colors.success, flex: 1 }]}>
              Request sent — waiting for the patient to approve.
            </Text>
          </Row>
        )}

        {!!error && (
          <View style={{ marginTop: spacing.md }}>
            <ErrorNote message={error} />
          </View>
        )}
      </Card>

      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="shield" size={16} color={colors.brandPurple} />
          <Text style={[type.caption, { flex: 1 }]}>
            You can never approve your own request. Only the patient can grant access, and they can
            revoke it at any time.
          </Text>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  fieldError: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
  successRow: { marginTop: spacing.md },
});
