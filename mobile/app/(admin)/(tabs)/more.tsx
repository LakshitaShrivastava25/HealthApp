import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Row, Screen, SectionTitle } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { colors, radius, spacing, type } from '../../../src/theme';

// Typed as Href, not string: experiments.typedRoutes checks these
// against the real route tree, so a typo'd path fails the build rather
// than becoming a dead tap.
const ITEMS: { icon: keyof typeof Feather.glyphMap; label: string; note: string; href: Href }[] = [
  {
    icon: 'users' as const,
    label: 'Patients',
    note: 'Directory of registered patient profiles',
    href: '/(admin)/patients',
  },
  {
    icon: 'key' as const,
    label: 'Accounts',
    note: 'Patient logins — search and deactivate',
    href: '/(admin)/accounts',
  },
  {
    icon: 'list' as const,
    label: 'Audit log',
    note: 'Every staff write action, with who and when',
    href: '/(admin)/audit-log',
  },
];

export default function AdminMore() {
  const router = useRouter();
  const { account, logout } = useAuth();

  function confirmLogout() {
    Alert.alert('Sign out?', 'You will need a new code to sign back in.', [
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
      <SectionTitle>Directories</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {ITEMS.map((item) => (
          <Pressable key={item.label} onPress={() => router.push(item.href)} style={styles.row}>
            <View style={styles.icon}>
              <Feather name={item.icon} size={17} color={colors.ink700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{item.label}</Text>
              <Text style={type.micro}>{item.note}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.ink300} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={type.caption}>Signed in as</Text>
            <Text style={type.label}>{account?.phone_number}</Text>
          </View>
          <Badge tone="neutral">{account?.role}</Badge>
        </Row>
        <Text style={[type.micro, { marginTop: spacing.sm }]}>
          Some queues are limited by role: document review needs OCR reviewer, policy validation
          needs claims operations, and everything else needs a full administrator.
        </Text>
      </Card>

      <Pressable onPress={confirmLogout} style={styles.signOut}>
        <Feather name="log-out" size={15} color={colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: colors.danger },
});
