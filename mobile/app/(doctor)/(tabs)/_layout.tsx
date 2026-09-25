import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '../../../src/theme';
import { useConfirmExit } from '../../../src/lib/useBackHandler';

export default function DoctorTabs() {
  // Back from any tab returns to the first tab; back there asks before
  // closing the app instead of exiting silently.
  useConfirmExit();

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        animation: 'shift',
        tabBarActiveTintColor: colors.brandTeal,
        tabBarInactiveTintColor: colors.ink300,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink900,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Patients',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="request-access"
        options={{
          title: 'Request',
          tabBarIcon: ({ color, size }) => <Feather name="user-plus" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
