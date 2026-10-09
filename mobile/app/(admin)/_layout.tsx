import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';

export default function AdminLayout() {
  const { isLoading, portal } = useAuth();
  // Only this portal's session may open these screens. index.tsx routes
  // everyone correctly, but a deep link or notification can land here
  // directly; the server refuses the data either way, this just sends the
  // person home instead of showing an empty screen.
  if (!isLoading && portal !== 'admin') return <Redirect href="/" />;

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
      <Stack.Screen name="otp-settings" options={{ title: 'OTP settings' }} />
    </Stack>
  );
}
