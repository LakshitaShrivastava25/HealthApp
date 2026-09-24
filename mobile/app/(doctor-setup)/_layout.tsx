import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

/**
 * Registration and the verification wait, kept outside the doctor tabs.
 *
 * A doctor in this state has no patients and no clinical screens to reach,
 * so a tab bar would be four disabled destinations. The web app expresses
 * the same rule with its Gate/RegisteredGate pair.
 */
export default function DoctorSetupLayout() {
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
      <Stack.Screen name="register" options={{ title: 'Doctor registration' }} />
      <Stack.Screen name="pending" options={{ title: 'Verification', headerBackVisible: false }} />
    </Stack>
  );
}
