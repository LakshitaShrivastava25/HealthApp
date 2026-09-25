import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AnimatedSplash from '../src/components/AnimatedSplash';
import { AuthProvider } from '../src/context/AuthContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <AnimatedSplash>
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
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
              <Stack.Screen name="(patient)" options={{ headerShown: false }} />
              <Stack.Screen name="(doctor)" options={{ headerShown: false }} />
              <Stack.Screen name="(doctor-setup)" options={{ headerShown: false }} />
              <Stack.Screen name="(admin)" options={{ headerShown: false }} />
            </Stack>
          </AnimatedSplash>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
