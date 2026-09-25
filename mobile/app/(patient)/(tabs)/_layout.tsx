import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text } from 'react-native';

import AppHeader from '../../../src/components/AppHeader';
import InsuranceTabIcon, { InsuranceTabButton } from '../../../src/components/InsuranceTabIcon';
import { colors } from '../../../src/theme';
import { useConfirmExit } from '../../../src/lib/useBackHandler';

/**
 * Insurance sits in the middle as a raised button — it is the screen people
 * reach for under pressure (a hospital desk asking about coverage), so it
 * gets the most prominent spot in the bar.
 */
export default function PatientTabs() {
  // Back from any tab returns to the first tab; back there asks before
  // closing the app instead of exiting silently.
  useConfirmExit();

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        animation: 'shift',
        tabBarActiveTintColor: colors.brandPurple,
        tabBarInactiveTintColor: colors.ink300,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // The active family member has to be visible and switchable from
        // every tab — AppHeader carries the ProfileSwitcher for that reason.
        header: ({ options, route }) => <AppHeader title={options.title ?? route.name} />,
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="locker"
        options={{
          title: 'Locker',
          tabBarIcon: ({ color, size }) => <Feather name="folder" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insurance"
        options={{
          title: 'Insurance',
          tabBarIcon: ({ focused }) => <InsuranceTabIcon focused={focused} />,
          tabBarButton: (props) => (
            <InsuranceTabButton
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              style={props.style}
              accessibilityState={props.accessibilityState}
              accessibilityLabel={props.accessibilityLabel}
              testID={props.testID}
            >
              {props.children}
            </InsuranceTabButton>
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.centerLabel, focused && { color: colors.brandPurpleDark }]}>Insurance</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="medicines"
        options={{
          title: 'Medicines',
          tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} />,
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

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 90 : 70,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  centerLabel: { fontSize: 11, fontWeight: '800', color: colors.brandPurple, marginTop: 2 },
});
