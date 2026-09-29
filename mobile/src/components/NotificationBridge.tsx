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
 *   that launched the app waits until the session has loaded, and a link
 *   meant for a different portal (a doctor alert on a patient session)
 *   falls back to the home screen instead of a dead route.
 */
export default function NotificationBridge() {
  const { isLoading, isAuthenticated, account, portal, profiles } = useAuth();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (isAuthenticated) void registerForPush();
  }, [isAuthenticated, account?.id]);

  // Reschedule when the family list changes (login, a member added).
  const profileKey = profiles.map((p) => p.id).join(',');
  useEffect(() => {
    if (portal === 'patient' && profiles.length) void syncMedicineReminders(profiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal, profileKey]);

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
    const allowed = pendingUrl === '/' || (!!portal && pendingUrl.startsWith(`/(${portal})`));
    router.push((allowed ? pendingUrl : '/') as Href);
    setPendingUrl(null);
  }, [pendingUrl, isLoading, navReady, isAuthenticated, portal, router]);

  return null;
}
