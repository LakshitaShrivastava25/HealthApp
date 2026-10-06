import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import AddFamilyMemberForm, { serverMessage } from '../../src/components/AddFamilyMemberForm';
import DateField, { formatIsoDate } from '../../src/components/DateField';
import {
  allergyKindLabel,
  BLOOD_GROUPS,
  ChipSelect,
  genderLabel,
  GENDERS,
  LANGUAGES,
  relationLabel,
} from '../../src/components/profileOptions';
import { Badge, Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { allergiesApi, authApi, profilesApi, unwrap } from '../../src/lib/api';
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL } from '../../src/lib/links';
import { colors, radius, spacing, type } from '../../src/theme';
import NotificationSettingsCard from '../../src/components/NotificationSettingsCard';

type Allergy = { id: string; kind: string; substance: string; reaction: string };

export default function Settings() {
  const { account, profiles, activeProfile, refreshProfiles, logout } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(activeProfile?.full_name ?? '');
  const [bloodGroup, setBloodGroup] = useState(activeProfile?.blood_group ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(activeProfile?.date_of_birth ?? '');
  const [gender, setGender] = useState(activeProfile?.gender ?? '');
  const [heightCm, setHeightCm] = useState(activeProfile?.height_cm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(activeProfile?.weight_kg?.toString() ?? '');
  const [language, setLanguage] = useState(activeProfile?.preferred_language || 'English');
  const [saving, setSaving] = useState(false);

  const [addingMember, setAddingMember] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /**
   * Allergies live in their own table (AllergyRecord), so they need their own
   * fetch, redone per profile: switching family members must never leave the
   * previous person's allergies on screen. A failed fetch is its own state —
   * on a medical record it must not read as "None recorded".
   */
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [allergyState, setAllergyState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [allergyReload, setAllergyReload] = useState(0);
  const activeProfileId = activeProfile?.id;

  useEffect(() => {
    if (!activeProfileId) return;
    let cancelled = false;
    setAllergies([]);
    setAllergyState('loading');
    allergiesApi
      .list(activeProfileId)
      .then((r) => {
        if (cancelled) return;
        setAllergies(unwrap<Allergy>(r.data));
        setAllergyState('loaded');
      })
      .catch(() => {
        if (!cancelled) setAllergyState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [activeProfileId, allergyReload]);

  // An edit form opened for one profile must not be saved onto another.
  useEffect(() => {
    setEditing(false);
  }, [activeProfileId]);

  function startEditing() {
    setFullName(activeProfile?.full_name ?? '');
    setBloodGroup(activeProfile?.blood_group ?? '');
    setDateOfBirth(activeProfile?.date_of_birth ?? '');
    setGender(activeProfile?.gender ?? '');
    setHeightCm(activeProfile?.height_cm?.toString() ?? '');
    setWeightKg(activeProfile?.weight_kg?.toString() ?? '');
    setLanguage(activeProfile?.preferred_language || 'English');
    setEditing(true);
  }

  async function handleSave() {
    if (!activeProfile || !fullName.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await profilesApi.update(activeProfile.id, {
        full_name: fullName.trim(),
        blood_group: bloodGroup,
        // null clears a date the person removed; '' would fail date parsing.
        date_of_birth: dateOfBirth || null,
        gender,
        // null clears a removed height/weight; '' would fail integer parsing
        // and omitting the field would silently keep the old value.
        height_cm: heightCm.trim() ? Number(heightCm) : null,
        weight_kg: weightKg.trim() ? Number(weightKg) : null,
        preferred_language: language,
      });
      await refreshProfiles();
      setEditing(false);
    } catch (err) {
      setError(serverMessage(err, "Couldn't save those changes. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handleMemberAdded(warning?: string) {
    setError(warning ?? null);
    setAddingMember(false);
    try {
      await refreshProfiles();
    } catch {
      // The member was created; the list will catch up on the next refresh.
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'You will be signed out and won’t be able to log back in. Doctor access and your emergency card stop working. To also have your records permanently erased, see “How account deletion works” below.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.deleteAccount();
              await logout();
              router.replace('/login');
            } catch {
              setError("Couldn't delete the account. Please try again.");
            }
          },
        },
      ]
    );
  }

  return (
    <Screen>
      {!!error && <ErrorNote message={error} />}

      <Card>
        <CardHeader title="Your profile" subtitle={`Editing ${activeProfile?.full_name ?? ''}`} />

        {editing ? (
          <>
            <Input label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />

            <ChipSelect label="Blood group" options={BLOOD_GROUPS} value={bloodGroup} onChange={setBloodGroup} allowClear />

            <DateField
              label="Date of birth"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              placeholder="Select date of birth"
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
            />

            <ChipSelect label="Gender" options={GENDERS} value={gender} onChange={setGender} allowClear />

            <Row style={{ gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" />
              </View>
            </Row>

            <ChipSelect label="Preferred language" options={LANGUAGES} value={language} onChange={setLanguage} />

            <Row style={{ gap: spacing.sm }}>
              <Button style={{ flex: 1 }} onPress={handleSave} disabled={!fullName.trim()} loading={saving}>
                Save
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(false)}>
                Cancel
              </Button>
            </Row>
          </>
        ) : (
          <>
            {[
              ['Name', activeProfile?.full_name],
              ['Relation', relationLabel(activeProfile?.relation)],
              ['Blood group', activeProfile?.blood_group || 'Not set'],
              ['Date of birth', formatIsoDate(activeProfile?.date_of_birth) ?? 'Not set'],
              // Sentence case from the choice list: "Prefer not to say".
              ['Gender', genderLabel(activeProfile?.gender) ?? 'Not set'],
              ['Height', activeProfile?.height_cm ? `${activeProfile.height_cm} cm` : 'Not set'],
              ['Weight', activeProfile?.weight_kg ? `${activeProfile.weight_kg} kg` : 'Not set'],
              ['Language', activeProfile?.preferred_language || 'English'],
            ].map(([label, value]) => (
              <Row key={label} style={styles.factRow}>
                <Text style={[type.caption, { flex: 1 }]}>{label}</Text>
                <Text style={[type.label, styles.factValue]}>{value}</Text>
              </Row>
            ))}

            <View style={styles.allergySection}>
              <Row style={{ gap: 6, marginBottom: spacing.xs }}>
                <Feather name="alert-triangle" size={12} color={colors.warning} />
                <Text style={type.caption}>Allergies</Text>
              </Row>
              {allergyState === 'loading' ? (
                <Text style={type.micro}>Loading…</Text>
              ) : allergyState === 'error' ? (
                <Pressable onPress={() => setAllergyReload((n) => n + 1)} hitSlop={6}>
                  <Text style={[type.caption, { color: colors.danger }]}>
                    Couldn't load allergies. Tap to retry.
                  </Text>
                </Pressable>
              ) : allergies.length === 0 ? (
                <Text style={type.caption}>None recorded.</Text>
              ) : (
                allergies.map((a) => (
                  <View key={a.id} style={styles.allergyRow}>
                    <Text style={[type.label, { color: colors.ink900 }]}>{a.substance}</Text>
                    <View style={styles.kindTag}>
                      <Text style={styles.kindTagText}>{allergyKindLabel(a.kind)}</Text>
                    </View>
                    {!!a.reaction && <Text style={type.caption}>— {a.reaction}</Text>}
                  </View>
                ))
              )}
            </View>

            <Button variant="secondary" onPress={startEditing} style={{ marginTop: spacing.md }}>
              Edit profile
            </Button>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Family members"
          subtitle="Each person keeps their own documents, medicines and insurance"
        />
        {profiles.map((p) => (
          <Row key={p.id} style={styles.factRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{p.full_name}</Text>
              <Text style={type.micro}>{relationLabel(p.relation)}</Text>
            </View>
            {p.id === activeProfile?.id && <Badge tone="info">Viewing</Badge>}
          </Row>
        ))}

        {addingMember ? (
          <AddFamilyMemberForm onDone={handleMemberAdded} onCancel={() => setAddingMember(false)} />
        ) : (
          <Button variant="secondary" onPress={() => setAddingMember(true)} style={{ marginTop: spacing.md }}>
            Add a family member
          </Button>
        )}
      </Card>

      <NotificationSettingsCard note="Medicine reminders and doctor access requests" />

      <Card>
        <CardHeader title="Account" />
        <Row style={styles.factRow}>
          <Text style={[type.caption, { flex: 1 }]}>Phone number</Text>
          <Text style={type.label}>{account?.phone_number}</Text>
        </Row>
        <Row style={styles.factRow}>
          <Text style={[type.caption, { flex: 1 }]}>Role</Text>
          <Badge tone="neutral">{account?.role}</Badge>
        </Row>

        <Pressable
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          style={styles.actionRow}
        >
          <Feather name="log-out" size={15} color={colors.ink700} />
          <Text style={type.label}>Sign out</Text>
        </Pressable>

        <Pressable onPress={confirmDeleteAccount} style={styles.actionRow}>
          <Feather name="trash-2" size={15} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: colors.danger }]}>Delete account</Text>
            <Text style={type.micro}>Closes your account and stops all sharing</Text>
          </View>
        </Pressable>
      </Card>

      <Card>
        <CardHeader title="Legal" />
        {[
          { icon: 'shield', label: 'Privacy policy', url: PRIVACY_URL },
          { icon: 'file-text', label: 'Terms of use', url: TERMS_URL },
          { icon: 'info', label: 'How account deletion works', url: DELETE_ACCOUNT_URL },
        ].map((item) => (
          <Pressable key={item.url} onPress={() => Linking.openURL(item.url)} style={styles.actionRow}>
            <Feather name={item.icon as 'shield'} size={15} color={colors.ink700} />
            <Text style={[type.label, { flex: 1 }]}>{item.label}</Text>
            <Feather name="external-link" size={15} color={colors.ink300} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  factValue: { flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
  factRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  allergySection: { paddingVertical: spacing.sm, gap: spacing.xs },
  allergyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  kindTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  kindTagText: { fontSize: 10, fontWeight: '600', color: colors.ink500 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: colors.brandPurple },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
