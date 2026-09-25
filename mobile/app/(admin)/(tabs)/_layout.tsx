import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '../../../src/theme';
import { useConfirmExit } from '../../../src/lib/useBackHandler';

export default function AdminTabs() {
  // Back from any tab returns to the first tab; back there asks before
  // closing the app instead of exiting silently.
  useConfirmExit();

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        animation: 'shift',
        tabBarActiveTintColor: colors.ink900,
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
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="policies"
        options={{
          title: 'Policies',
          tabBarIcon: ({ color, size }) => <Feather name="shield" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="doctors"
        options={{
          title: 'Doctors',
          tabBarIcon: ({ color, size }) => <Feather name="user-check" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
