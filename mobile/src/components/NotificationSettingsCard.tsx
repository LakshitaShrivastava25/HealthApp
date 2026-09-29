import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { registerForPush, syncMedicineReminders } from '../lib/notifications';
import { colors, radius, spacing, type } from '../theme';
import { Button, Card, CardHeader, Row } from './ui';

/**
 * Shows whether this phone will get alerts, and offers the one action that
 * helps: ask again, or — once Android/iOS stops letting the app ask — open
 * the system settings page where it can be switched back on.
 */
export default function NotificationSettingsCard({ note }: { note: string }) {
  const { portal, profiles } = useAuth();
  const [status, setStatus] = useState<Notifications.NotificationPermissionsStatus | null>(null);

  const refresh = useCallback(() => {
    void Notifications.getPermissionsAsync().then(setStatus);
  }, []);

  // Re-check on return from the system settings page.
  useFocusEffect(refresh);

  async function turnOn() {
    if (status?.canAskAgain) {
      const next = await Notifications.requestPermissionsAsync();
      setStatus(next);
      if (next.granted) {
        void registerForPush();
        if (portal === 'patient') void syncMedicineReminders(profiles);
      }
    } else {
      await Linking.openSettings();
    }
  }

  const on = !!status?.granted;

  return (
    <Card>
      <CardHeader title="Notifications" subtitle={note} />
      <Row style={styles.statusRow}>
        <View style={[styles.icon, { backgroundColor: on ? colors.successBg : colors.warningBg }]}>
          <Feather name={on ? 'bell' : 'bell-off'} size={16} color={on ? colors.success : colors.warning} />
        </View>
        <Text style={[type.label, { flex: 1 }]}>
          {status === null ? 'Checking…' : on ? 'On for this phone' : 'Off for this phone'}
        </Text>
      </Row>
      {status !== null && !on && (
        <Button onPress={turnOn} style={{ marginTop: spacing.md }}>
          {status.canAskAgain ? 'Turn on notifications' : 'Open phone settings'}
        </Button>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  statusRow: { marginTop: spacing.xs },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
