import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { usePin } from '../context/PinContext';
import { resetTo } from '../lib/navigation';

/**
 * Log out — after asking. Every sign-out button (More, Profile, Settings,
 * the doctor profile, the pending-verification screen, admin) uses this, so a
 * stray tap never ends the session.
 */
export function useConfirmLogout() {
  const { logout } = useAuth();
  const { isRegistered } = usePin();

  return useCallback(() => {
    // Signing out keeps this phone registered, so most people come back
    // with their PIN and never see a code. Promising them an SMS would be
    // wrong, and it is the sort of wrong that makes someone think the app
    // has forgotten them.
    const message = isRegistered
      ? 'You will need your PIN to sign in again on this phone.'
      : 'You will need your phone number and a one-time code to sign in again.';

    Alert.alert('Log out?', message, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          resetTo('/login');
        },
      },
    ]);
  }, [logout, isRegistered]);
}
