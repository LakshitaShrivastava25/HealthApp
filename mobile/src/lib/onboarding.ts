import * as SecureStore from 'expo-secure-store';

/**
 * Whether this device has already been through the intro slides. Stored
 * locally, not on the account: it describes the install, and signing out
 * should not replay the tour.
 */
const KEY = 'healthnow.onboarding_seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen() {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // Worst case the tour shows again next launch.
  }
}
