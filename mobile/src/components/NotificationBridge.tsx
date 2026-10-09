import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { registerForPush, syncMedicineReminders } from '../lib/notifications';

/**
 * Connects notifications to the signed-in session. Renders nothing.
 *
 * - Once someone is signed in: registers the phone for push, and (for a
 *   patient) schedules the family's medicine reminders.
 * - When a notification is tapped: opens the screen it is about. A tap
 *   that launched the app waits until the session has loaded. One account
 *   can be both patient and doctor, so a link for the other mode (an access
 *   request while in Doctor mode, an approval while in User mode) switches
 *   mode first; a link this account cannot open falls back to home.
 */
export default function NotificationBridge() {
  const { isLoading, isAuthenticated, account, portal, profiles, doctor, switchMode } = useAuth();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (isAuthenticated) void registerForPush();
  }, [isAuthenticated, account?.id]);

  // Reschedule when the family list changes (login, a member added). In
  // Doctor mode too: these are the account's own family's medicines, and
  // their reminders must not stop because the person is seeing patients.
  const profileKey = profiles.map((p) => p.id).join(',');
  const ownsProfiles = !!portal && portal !== 'admin';
  useEffect(() => {
    if (ownsProfiles && profiles.length) void syncMedicineReminders(profiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownsProfiles, profileKey]);

  useEffect(() => {
    const take = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledIds.current.has(id)) return;
      handledIds.current.add(id);
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') setPendingUrl(url);
    };
    // The tap that cold-started the app, then any tap while it runs.
    void Notifications.getLastNotificationResponseAsync().then(take);
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingUrl || isLoading || !navReady) return;
    if (!isAuthenticated) return; // opened after logout: the login screen stays
    setPendingUrl(null);

    // Which mode the link belongs to, and whether this account has it.
    const needs = pendingUrl.startsWith('/(patient)')
      ? 'patient'
      : pendingUrl.startsWith('/(doctor)')
        ? 'doctor'
        : null;
    const canOpen =
      needs === 'patient'
        ? portal !== 'admin'
        : needs === 'doctor'
          ? doctor?.verification_status === 'verified'
          : !!portal && pendingUrl.startsWith(`/(${portal})`);

    if (pendingUrl === '/' || !canOpen) {
      router.push('/' as Href);
      return;
    }
    if (needs && portal !== needs) {
      switchMode(needs);
      // Let the mode commit before the target's route guard reads it.
      setTimeout(() => router.push(pendingUrl as Href), 0);
      return;
    }
    router.push(pendingUrl as Href);
  }, [pendingUrl, isLoading, navReady, isAuthenticated, portal, doctor, switchMode, router]);

  return null;
}
