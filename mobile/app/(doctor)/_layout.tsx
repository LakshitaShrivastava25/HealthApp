import { Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { RedirectOnce } from '../../src/components/RedirectOnce';

export default function DoctorLayout() {
  const { isLoading, portal } = useAuth();
  // Only this portal's session may open these screens. index.tsx routes
  // everyone correctly, but a deep link or notification can land here
  // directly; the server refuses the data either way, this just sends the
  // person home instead of showing an empty screen.
  if (!isLoading && portal !== 'doctor') return <RedirectOnce href="/" />;

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
      <Stack.Screen name="patient/[profileId]" options={{ title: 'Patient record' }} />
    </Stack>
  );
}
