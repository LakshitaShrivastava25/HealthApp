import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

/**
 * The patient area is a Stack wrapping a Tabs group.
 *
 * Only five destinations fit comfortably in a bottom bar, and this portal
 * has eleven screens — so the five daily ones are tabs and the rest are
 * pushed screens reached from More. That split is why the tabs live in a
 * nested group rather than at this level.
 */
export default function PatientLayout() {
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
      <Stack.Screen name="profile" options={{ title: 'My Profile' }} />
      <Stack.Screen name="timeline" options={{ title: 'Health Timeline' }} />
      <Stack.Screen name="find-care" options={{ title: 'Find Care' }} />
      <Stack.Screen name="emergency" options={{ title: 'Emergency Card' }} />
      <Stack.Screen name="doctor-access" options={{ title: 'Doctor Access' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="help" options={{ title: 'Help & Support' }} />
      <Stack.Screen name="document/[id]" options={{ title: 'Document' }} />
    </Stack>
  );
}
