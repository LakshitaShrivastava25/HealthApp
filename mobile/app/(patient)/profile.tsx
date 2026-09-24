import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../src/components/ui';
import { useAuth, type Profile } from '../../src/context/AuthContext';
import { colors, radius, shadow, spacing, type } from '../../src/theme';

type FeatherName = keyof typeof Feather.glyphMap;

function ageFrom(dob?: string | null) {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

/**
 * The person behind the header avatar: who is signed in, whose records are
 * showing, a one-tap switch between family members, and sign-out.
 */
export default function ProfileScreen() {
  const { account, profiles, activeProfile, setActiveProfile, logout } = useAuth();
  const router = useRouter();

  if (!activeProfile) return null;

  const age = ageFrom(activeProfile.date_of_birth);
  const facts: { label: string; value: string; icon: FeatherName }[] = [
    { label: 'Blood', value: activeProfile.blood_group || '—', icon: 'droplet' },
    { label: 'Age', value: age !== null ? `${age} yrs` : '—', icon: 'calendar' },
    { label: 'Height', value: activeProfile.height_cm ? `${activeProfile.height_cm} cm` : '—', icon: 'maximize-2' },
    { label: 'Weight', value: activeProfile.weight_kg ? `${activeProfile.weight_kg} kg` : '—', icon: 'activity' },
  ];

  const menu: { icon: FeatherName; label: string; note: string; href: Href }[] = [
    { icon: 'edit-3', label: 'Edit profile', note: 'Name, blood group, height and weight', href: '/(patient)/settings' },
    { icon: 'alert-triangle', label: 'Emergency card', note: 'QR card for paramedics', href: '/(patient)/emergency' },
    { icon: 'user-check', label: 'Doctor access', note: 'Who can see these records', href: '/(patient)/doctor-access' },
    { icon: 'settings', label: 'Settings', note: 'Family members and account', href: '/(patient)/settings' },
    { icon: 'help-circle', label: 'Help & support', note: 'How the app works', href: '/(patient)/help' },
  ];

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your phone number and a new code to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  return (
    <Screen>
      {/* Identity */}
      <LinearGradient colors={['#7C6AE0', colors.brandPurpleDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{activeProfile.initials}</Text>
          </View>
        </View>
        <Text style={styles.name}>{activeProfile.full_name}</Text>
        <View style={styles.relationPill}>
          <Text style={styles.relationText}>{activeProfile.relation}</Text>
        </View>
        {!!account?.phone_number && (
          <View style={styles.phoneRow}>
            <Feather name="phone" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.phoneText}>{account.phone_number}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Health facts */}
      <View style={styles.factsRow}>
        {facts.map((f) => (
          <View key={f.label} style={styles.fact}>
            <Feather name={f.icon} size={15} color={colors.brandPurple} />
            <Text style={styles.factValue} numberOfLines={1}>{f.value}</Text>
            <Text style={styles.factLabel}>{f.label}</Text>
          </View>
        ))}
      </View>

      {/* Family */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Family members</Text>
        <Pressable onPress={() => router.push('/(patient)/settings')} hitSlop={8}>
          <Text style={styles.sectionAction}>+ Add</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {profiles.map((p: Profile, i) => {
          const isActive = p.id === activeProfile.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActiveProfile(p)}
              style={[styles.row, i === profiles.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.smallAvatar, isActive && { backgroundColor: colors.brandPurple }]}>
                <Text style={[styles.smallAvatarText, isActive && { color: colors.white }]}>{p.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{p.full_name}</Text>
                <Text style={[type.micro, { textTransform: 'capitalize' }]}>{p.relation}</Text>
              </View>
              {isActive ? (
                <View style={styles.viewingPill}>
                  <Text style={styles.viewingText}>Viewing</Text>
                </View>
              ) : (
                <Text style={styles.switchText}>Switch</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Menu */}
      <View style={styles.card}>
        {menu.map((m, i) => (
          <Pressable
            key={m.label}
            onPress={() => router.push(m.href)}
            style={({ pressed }) => [styles.row, i === menu.length - 1 && { borderBottomWidth: 0 }, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.menuIcon}>
              <Feather name={m.icon} size={17} color={colors.brandPurple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{m.label}</Text>
              <Text style={type.micro}>{m.note}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.ink300} />
          </Pressable>
        ))}
      </View>

      {/* Sign out */}
      <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.8 }]}>
        <Feather name="log-out" size={17} color={colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Text style={styles.version}>HealthNow · Your records stay private</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarRing: {
    padding: 4,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: colors.brandPurple },
  name: { fontSize: 22, fontWeight: '800', color: colors.white, marginTop: spacing.md, textAlign: 'center' },
  relationPill: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  relationText: { color: colors.white, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  phoneText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },

  factsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  fact: { flex: 1, alignItems: 'center', gap: 3 },
  factValue: { fontSize: 15, fontWeight: '800', color: colors.ink900 },
  factLabel: { fontSize: 11, fontWeight: '500', color: colors.ink500 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink900 },
  sectionAction: { fontSize: 13, fontWeight: '700', color: colors.brandPurple },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink900 },
  smallAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: { fontSize: 13, fontWeight: '700', color: colors.brandPurple },
  viewingPill: { backgroundColor: colors.successBg, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  viewingText: { fontSize: 11, fontWeight: '700', color: colors.success },
  switchText: { fontSize: 13, fontWeight: '600', color: colors.brandPurple },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: '#F8CFCF',
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  version: { textAlign: 'center', fontSize: 11, color: colors.ink300, marginTop: spacing.xs },
});
