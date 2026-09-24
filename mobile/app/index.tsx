import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Loading } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { hasSeenOnboarding } from '../src/lib/onboarding';
import { colors } from '../src/theme';

/**
 * The single entry point. Everything about where a person lands is decided
 * here from the session, so no screen has to guard itself individually.
 *
 * A patient with no Profile yet goes to profile setup rather than to an
 * empty dashboard: every record in this system hangs off a profile, so an
 * account without one has nothing any patient screen can render.
 */
export default function Index() {
  const { isLoading, isAuthenticated, portal, profiles } = useAuth();
  const [seenIntro, setSeenIntro] = useState<boolean | null>(null);

  useEffect(() => {
    void hasSeenOnboarding().then(setSeenIntro);
  }, []);

  if (isLoading || seenIntro === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.surface }}>
        <Loading />
      </View>
    );
  }

  // First launch on this device gets the intro slides before sign-in.
  if (!isAuthenticated) return <Redirect href={seenIntro ? '/login' : '/onboarding'} />;

  switch (portal) {
    case 'admin':
      return <Redirect href="/(admin)/(tabs)" />;
    case 'doctor':
      return <Redirect href="/(doctor)/(tabs)" />;
    case 'doctor-setup':
      return <Redirect href="/(doctor-setup)/register" />;
    case 'patient':
      return profiles.length === 0 ? (
        <Redirect href="/profile-setup" />
      ) : (
        <Redirect href="/(patient)/(tabs)" />
      );
    default:
      return <Redirect href="/login" />;
  }
}
