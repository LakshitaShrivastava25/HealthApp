import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { resetTo } from '../lib/navigation';

/**
 * Log out — after asking. Every sign-out button (More, Profile, Settings,
 * the doctor profile, the pending-verification screen, admin) uses this, so a
 * stray tap never ends the session.
 */
export function useConfirmLogout() {
  const { logout } = useAuth();

  return useCallback(() => {
    Alert.alert('Log out?', 'You will need your phone number and a one-time code to sign in again.', [
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
  }, [logout]);
}
