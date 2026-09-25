import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, Share, StyleSheet, Switch, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { allergiesApi, emergencyApi, medicinesApi, unwrap } from '../../src/lib/api';
import { getServerRoot } from '../../src/lib/config';
import { colors, radius, spacing, type } from '../../src/theme';

type EmergencyProfile = {
  id: string;
  profile: string;
  public_token: string;
  is_active: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  include_blood_group: boolean;
  include_allergies: boolean;
  include_medications: boolean;
  include_emergency_contact: boolean;
};

type ToggleKey =
  | 'include_blood_group'
  | 'include_allergies'
  | 'include_medications'
  | 'include_emergency_contact';

const TOGGLES: { key: ToggleKey; label: string; note: string }[] = [
  { key: 'include_blood_group', label: 'Blood group', note: 'Shown to whoever scans the code' },
  { key: 'include_allergies', label: 'Allergies', note: 'Drug and other recorded allergies' },
  { key: 'include_medications', label: 'Current medicines', note: 'What you are taking right now' },
  { key: 'include_emergency_contact', label: 'Emergency contact', note: 'Name and phone number' },
];

export default function EmergencyCard() {
  const { activeProfile } = useAuth();

  const [ep, setEp] = useState<EmergencyProfile | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setError(null);
    try {
      const [cards, allergyRes, medRes] = await Promise.all([
        emergencyApi.list(),
        allergiesApi.list(activeProfile.id),
        medicinesApi.list(activeProfile.id),
      ]);
      // The endpoint returns every card on the account, so the one for the
      // profile in view is picked here rather than server-side.
      setEp(unwrap<EmergencyProfile>(cards.data).find((c) => c.profile === activeProfile.id) ?? null);
      setAllergies(unwrap<{ substance: string }>(allergyRes.data).map((a) => a.substance));
      setMedications(unwrap<{ name: string }>(medRes.data).map((m) => m.name));
    } catch {
      setError("Couldn't load your emergency card. Pull down to retry.");
    }
  }, [activeProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const publicUrl = ep ? `${getServerRoot()}/api/public/emergency/${ep.public_token}/` : '';

  async function handleCreate() {
    if (!activeProfile) return;
    setCreating(true);
    setError(null);
    try {
      await emergencyApi.create(activeProfile.id, contactName.trim(), contactPhone.trim());
      await load();
    } catch {
      setError("Couldn't create the card. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(key: ToggleKey) {
    if (!ep) return;
    const previous = ep[key];
    setEp({ ...ep, [key]: !previous });
    try {
      await emergencyApi.update(ep.id, { [key]: !previous });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch {
      // Revert: a switch showing the new position while the server holds
      // the old value is worse than the change simply not happening,
      // because this card is what a paramedic reads.
      setEp((current) => (current ? { ...current, [key]: previous } : current));
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }

  function confirmRevoke() {
    Alert.alert(
      'Revoke this card?',
      'Anyone who scans the existing QR will see nothing. You can generate a new one afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            if (!ep) return;
            try {
              await emergencyApi.revoke(ep.id);
              await load();
            } catch {
              setError("Couldn't revoke the card.");
            }
          },
        },
      ]
    );
  }

  async function handleRegenerate() {
    if (!ep) return;
    try {
      await emergencyApi.regenerate(ep.id);
      await load();
    } catch {
      setError("Couldn't generate a new code.");
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      {!ep ? (
        <Card>
          <CardHeader
            title="Set up your emergency card"
            subtitle="A QR anyone can scan without logging in — you choose exactly what it reveals."
          />
          <Input
            label="Emergency contact name"
            value={contactName}
            onChangeText={setContactName}
            placeholder="e.g. Anita Sharma"
            autoCapitalize="words"
          />
          <Input
            label="Emergency contact phone"
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
          />
          <Button
            onPress={handleCreate}
            disabled={!contactName.trim() || !contactPhone.trim()}
            loading={creating}
          >
            Generate emergency QR
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={type.h2}>{activeProfile?.full_name}</Text>
              <Badge tone={ep.is_active ? 'success' : 'danger'}>
                {ep.is_active ? 'Active' : 'Revoked'}
              </Badge>
            </Row>

            {ep.is_active ? (
              <View style={styles.qrWrap}>
                <View style={styles.qrBox}>
                  <QRCode value={publicUrl} size={168} backgroundColor={colors.white} />
                </View>
                <Text style={[type.micro, { textAlign: 'center', marginTop: spacing.sm }]}>
                  Scanning this opens a read-only card. No login required.
                </Text>
              </View>
            ) : (
              <Text style={[type.caption, { marginTop: spacing.md }]}>
                This card is revoked — scanning the old QR shows nothing. Generate a new code to
                start using it again.
              </Text>
            )}

            <View style={styles.summaryBlock}>
              {ep.include_blood_group && (
                <Row>
                  <Feather name="droplet" size={14} color={colors.danger} />
                  <Text style={type.caption}>
                    Blood group: {activeProfile?.blood_group || 'not recorded'}
                  </Text>
                </Row>
              )}
              {ep.include_allergies && (
                <Row style={{ alignItems: 'flex-start' }}>
                  <Feather name="alert-triangle" size={14} color={colors.warning} />
                  <Text style={[type.caption, { flex: 1 }]}>
                    Allergies: {allergies.length ? allergies.join(', ') : 'none recorded'}
                  </Text>
                </Row>
              )}
              {ep.include_medications && (
                <Row style={{ alignItems: 'flex-start' }}>
                  <Feather name="circle" size={14} color={colors.brandPurple} />
                  <Text style={[type.caption, { flex: 1 }]}>
                    Medicines: {medications.length ? medications.join(', ') : 'none recorded'}
                  </Text>
                </Row>
              )}
              {ep.include_emergency_contact && (
                <Row>
                  <Feather name="phone" size={14} color={colors.brandTeal} />
                  <Text style={type.caption}>
                    {ep.emergency_contact_name} · {ep.emergency_contact_phone}
                  </Text>
                </Row>
              )}
            </View>

            {ep.is_active && (
              <Row style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Button
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() =>
                    Share.share({
                      message: `My emergency health card: ${publicUrl}`,
                      url: publicUrl,
                    })
                  }
                >
                  Share
                </Button>
                <Button
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await Clipboard.setStringAsync(publicUrl);
                    setSavedFlash(true);
                    setTimeout(() => setSavedFlash(false), 1600);
                  }}
                >
                  Copy link
                </Button>
              </Row>
            )}
          </Card>

          <Card>
            <CardHeader title="What the card shows" subtitle="Changes take effect immediately" />
            {TOGGLES.map((t) => (
              <Row key={t.key} style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.label}>{t.label}</Text>
                  <Text style={type.micro}>{t.note}</Text>
                </View>
                <Switch
                  value={ep[t.key]}
                  onValueChange={() => handleToggle(t.key)}
                  trackColor={{ true: colors.brandPurple, false: colors.border }}
                  thumbColor={colors.white}
                />
              </Row>
            ))}
            {savedFlash && (
              <Row style={{ marginTop: spacing.sm }}>
                <Feather name="check" size={13} color={colors.success} />
                <Text style={[type.micro, { color: colors.success }]}>Saved</Text>
              </Row>
            )}
          </Card>

          <Card>
            <CardHeader title="Card security" />
            <Pressable onPress={handleRegenerate} style={styles.actionRow}>
              <Feather name="refresh-cw" size={15} color={colors.ink700} />
              <View style={{ flex: 1 }}>
                <Text style={type.label}>Generate a new code</Text>
                <Text style={type.micro}>The old QR stops working immediately</Text>
              </View>
            </Pressable>
            {ep.is_active && (
              <Pressable onPress={confirmRevoke} style={styles.actionRow}>
                <Feather name="slash" size={15} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.label, { color: colors.danger }]}>Revoke this card</Text>
                  <Text style={type.micro}>Scanning it will show nothing at all</Text>
                </View>
              </Pressable>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', marginTop: spacing.lg },
  qrBox: {
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  toggleRow: { paddingVertical: spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
