import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Row, Screen, SectionTitle } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { colors, radius, spacing, type } from '../../../src/theme';

type Item = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  note: string;
  // Href rather than string: app.json sets experiments.typedRoutes, so
  // expo-router checks these against the real route tree. A plain string
  // widens past that check and a typo'd path would only show up as a dead
  // tap at runtime.
  href: Href;
};

const CARE: Item[] = [
  {
    icon: 'activity',
    label: 'Health Timeline',
    note: 'Every diagnosis, test and prescription in date order',
    href: '/(patient)/timeline',
  },
  {
    icon: 'search',
    label: 'Find Care',
    note: 'Verified doctors, clinic hours and booking numbers',
    href: '/(patient)/find-care',
  },
  {
    icon: 'alert-triangle',
    label: 'Emergency Card',
    note: 'A scannable QR for paramedics — you choose what it shows',
    href: '/(patient)/emergency',
  },
];

const ACCOUNT: Item[] = [
  {
    icon: 'user-check',
    label: 'Doctor Access',
    note: 'Approve, deny or revoke who can see these records',
    href: '/(patient)/doctor-access',
  },
  {
    icon: 'settings',
    label: 'Settings',
    note: 'Profile details, family members and account',
    href: '/(patient)/settings',
  },
  {
    icon: 'help-circle',
    label: 'Help & Support',
    note: 'How the app works and how to reach us',
    href: '/(patient)/help',
  },
];

export default function More() {
  const router = useRouter();
  const { account, logout } = useAuth();

  function confirmLogout() {
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

  const renderItem = (item: Item) => (
    <Pressable key={item.label} onPress={() => router.push(item.href)} style={styles.row}>
      <View style={styles.icon}>
        <Feather name={item.icon} size={17} color={colors.brandPurple} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{item.label}</Text>
        <Text style={type.micro}>{item.note}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.ink300} />
    </Pressable>
  );

  return (
    <Screen>
      <SectionTitle>Care</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>{CARE.map(renderItem)}</Card>

      <SectionTitle>Account</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>{ACCOUNT.map(renderItem)}</Card>

      {/* The web app exposes /doctor/register as an open route; this is the
          same door on mobile. Registering does not grant anything — an
          admin still has to verify the registration before the account can
          request access to any patient's records. */}
      <Card onPress={() => router.push('/(doctor-setup)/register')}>
        <Row>
          <View style={styles.icon}>
            <Feather name="briefcase" size={17} color={colors.brandTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>I'm a doctor</Text>
            <Text style={type.micro}>Register your practice — an admin verifies it before approval</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.ink300} />
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={type.caption}>Signed in as</Text>
            <Text style={type.label}>{account?.phone_number}</Text>
          </View>
          <Pressable onPress={confirmLogout} style={styles.signOut}>
            <Feather name="log-out" size={14} color={colors.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
  },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.danger },
});
