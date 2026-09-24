import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';

/**
 * Run `handler` when the Android back button is pressed while this screen
 * is focused. Return true from it to consume the press; false lets the
 * navigator handle it as usual.
 *
 * Tied to focus rather than mount: a tab screen stays mounted underneath
 * pushed screens, and its handler must not steal their back presses.
 */
export function useBackHandler(handler: () => boolean) {
  const ref = useRef(handler);
  ref.current = handler;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => ref.current());
      return () => sub.remove();
    }, [])
  );
}

/**
 * For the root of a navigation tree — the screen where "back" has nowhere
 * left to go. Instead of the app silently closing, ask first.
 *
 * `canGoBackInScreen` lets a screen unwind its own internal steps (a
 * multi-step form, a carousel) before falling through to the exit prompt.
 */
export function useConfirmExit(canGoBackInScreen?: () => boolean) {
  const router = useRouter();
  const open = useRef(false);

  useBackHandler(() => {
    if (canGoBackInScreen?.()) return true;
    // Anything still on the stack (or a non-home tab) unwinds first, in
    // reverse order — the prompt only appears once back has nowhere to go.
    if (router.canGoBack()) return false;
    if (open.current) return true;
    open.current = true;
    Alert.alert(
      'Exit HealthNow?',
      'Are you sure you want to close the app?',
      [
        { text: 'Stay', style: 'cancel', onPress: () => (open.current = false) },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ],
      { cancelable: true, onDismiss: () => (open.current = false) }
    );
    return true;
  });
}
