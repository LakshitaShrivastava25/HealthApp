import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        gestureEnabled: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink900,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="patients" options={{ title: 'Patients' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="audit-log" options={{ title: 'Audit log' }} />
    </Stack>
  );
}
