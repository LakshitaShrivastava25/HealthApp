import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AnimatedSplash from '../src/components/AnimatedSplash';
import NotificationBridge from '../src/components/NotificationBridge';
import RequirePin from '../src/components/RequirePin';
import { AuthProvider } from '../src/context/AuthContext';
import { PinProvider } from '../src/context/PinContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AuthProvider>
            {/* Inside AuthProvider: signing in with a PIN yields a token
                pair that auth adopts, so it has to be able to reach it. */}
            <PinProvider>
            <StatusBar style="dark" />
            <NotificationBridge />
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
                {/* The hand-over between User and Doctor mode (src/components/ModeSwitch.tsx). */}
                <Stack.Screen name="switch-mode" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
                {/* Uploaded files open here, inside the app (src/lib/viewer.ts). */}
                <Stack.Screen name="viewer" options={{ animation: 'slide_from_bottom', title: 'Document' }} />
                {/* PIN sign-in setup and settings. */}
                <Stack.Screen name="mpin-setup" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                <Stack.Screen name="pin-settings" options={{ title: 'PIN' }} />
              </Stack>
              {/* Above the navigator so it still sees has_mpin arrive
                  after a cached session has already routed. */}
              <RequirePin />
            </AnimatedSplash>
            </PinProvider>
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
