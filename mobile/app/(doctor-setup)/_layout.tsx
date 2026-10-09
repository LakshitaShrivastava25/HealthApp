import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';

/**
 * Registration and the verification wait, kept outside the doctor tabs.
 *
 * A doctor in this state has no patients and no clinical screens to reach,
 * so a tab bar would be four disabled destinations. The web app expresses
 * the same rule with its DoctorGate.
 *
 * Opened from User mode too: "Register as a doctor" on More pushes the
 * registration form from there.
 */
export default function DoctorSetupLayout() {
  const { isLoading, portal } = useAuth();
  // A verified doctor, a staff account or a signed-out session has no
  // business here; the index route sends each of them where they belong.
  if (!isLoading && portal !== 'patient' && portal !== 'doctor-setup') return <Redirect href="/" />;

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
      <Stack.Screen name="register" options={{ title: 'Register as a doctor' }} />
      <Stack.Screen name="pending" options={{ title: 'Verification', headerBackVisible: false }} />
    </Stack>
  );
}
