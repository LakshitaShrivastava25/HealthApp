import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import DateField, { formatIsoDate } from '../../src/components/DateField';
import { Badge, Button, Card, CardHeader, ErrorNote, Input, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { authApi, profilesApi } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

const RELATIONS = ['father', 'mother', 'spouse', 'son', 'daughter', 'other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const GENDERS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

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
  const [saving, setSaving] = useState(false);

  const [addingMember, setAddingMember] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberRelation, setMemberRelation] = useState('other');
  const [addingBusy, setAddingBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setFullName(activeProfile?.full_name ?? '');
    setBloodGroup(activeProfile?.blood_group ?? '');
    setDateOfBirth(activeProfile?.date_of_birth ?? '');
    setGender(activeProfile?.gender ?? '');
    setHeightCm(activeProfile?.height_cm?.toString() ?? '');
    setWeightKg(activeProfile?.weight_kg?.toString() ?? '');
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
        // Numeric fields are omitted when blank — '' fails integer parsing
        // server-side rather than clearing the value.
        ...(heightCm ? { height_cm: Number(heightCm) } : {}),
        ...(weightKg ? { weight_kg: Number(weightKg) } : {}),
      });
      await refreshProfiles();
      setEditing(false);
    } catch {
      setError("Couldn't save those changes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!memberName.trim()) return;
    setError(null);
    setAddingBusy(true);
    try {
      await profilesApi.create({ full_name: memberName.trim(), relation: memberRelation });
      await refreshProfiles();
      setMemberName('');
      setMemberRelation('other');
      setAddingMember(false);
    } catch {
      setError("Couldn't add that family member.");
    } finally {
      setAddingBusy(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your account will be deactivated and you will be signed out immediately. Contact support if you need it restored.',
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

            <Text style={[type.caption, { marginBottom: spacing.sm }]}>Blood group</Text>
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

            <DateField
              label="Date of birth"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              placeholder="Select date of birth"
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
            />

            <Text style={[type.caption, { marginBottom: spacing.sm }]}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value}
                  onPress={() => setGender((v) => (v === g.value ? '' : g.value))}
                  style={[styles.chip, gender === g.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>

            <Row style={{ gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" />
              </View>
            </Row>

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
              ['Relation', activeProfile?.relation],
              ['Blood group', activeProfile?.blood_group || 'Not set'],
              ['Date of birth', formatIsoDate(activeProfile?.date_of_birth) ?? 'Not set'],
              ['Gender', GENDERS.find((g) => g.value === activeProfile?.gender)?.label ?? 'Not set'],
              ['Height', activeProfile?.height_cm ? `${activeProfile.height_cm} cm` : 'Not set'],
              ['Weight', activeProfile?.weight_kg ? `${activeProfile.weight_kg} kg` : 'Not set'],
            ].map(([label, value]) => (
              <Row key={label} style={styles.factRow}>
                <Text style={[type.caption, { flex: 1 }]}>{label}</Text>
                <Text style={type.label}>{value}</Text>
              </Row>
            ))}
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
              <Text style={type.micro}>{p.relation}</Text>
            </View>
            {p.id === activeProfile?.id && <Badge tone="info">Viewing</Badge>}
          </Row>
        ))}

        {addingMember ? (
          <View style={{ marginTop: spacing.md }}>
            <Input
              label="Full name"
              value={memberName}
              onChangeText={setMemberName}
              placeholder="e.g. Ramesh Sharma"
              autoCapitalize="words"
            />
            <Text style={[type.caption, { marginBottom: spacing.sm }]}>Relation</Text>
            <View style={styles.chipRow}>
              {RELATIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setMemberRelation(r)}
                  style={[styles.chip, memberRelation === r && styles.chipActive]}
                >
                  <Text style={[styles.chipText, memberRelation === r && styles.chipTextActive]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Row style={{ gap: spacing.sm }}>
              <Button style={{ flex: 1 }} onPress={handleAddMember} disabled={!memberName.trim()} loading={addingBusy}>
                Add
              </Button>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => setAddingMember(false)}>
                Cancel
              </Button>
            </Row>
          </View>
        ) : (
          <Button variant="secondary" onPress={() => setAddingMember(true)} style={{ marginTop: spacing.md }}>
            Add a family member
          </Button>
        )}
      </Card>

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
            <Text style={type.micro}>Deactivates your login — medical records are not erased</Text>
          </View>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  factRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700, textTransform: 'capitalize' },
  chipTextActive: { color: colors.white },
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
