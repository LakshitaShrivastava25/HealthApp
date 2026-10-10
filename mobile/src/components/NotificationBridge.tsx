import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter, useSegments, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { resetTo } from '../lib/navigation';
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
  const { isLoading, isAuthenticated, account, portal, profiles, doctor, refreshDoctor } = useAuth();
  const segments = useSegments();
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
    const url = pendingUrl;

    // Which mode the link belongs to, and whether this account has it.
    const needs = url.startsWith('/(patient)') ? 'patient' : url.startsWith('/(doctor)') ? 'doctor' : null;
    const canOpen =
      needs === 'patient'
        ? portal !== 'admin'
        : needs === 'doctor'
          ? doctor?.verification_status === 'verified'
          : !!portal && url.startsWith(`/(${portal})`);

    if (url === '/' || !canOpen) {
      // e.g. "your registration was approved": pick up the new status first,
      // so the home route sends the doctor to the right place — and replace,
      // so Back does not reveal a second copy of the same home screen.
      setPendingUrl(null);
      void refreshDoctor().then(() => resetTo('/'));
      return;
    }

    const area = needs ? `(${needs})` : `(${portal})`;
    if (segments[0] !== area) {
      // Mid-switch: wait for the switch screen to open the new area; this
      // effect runs again once it is on screen (segments change).
      if ((segments[0] as string) === 'switch-mode') return;
      if (needs && portal !== needs) {
        // Another mode: through the switch screen, never by flipping the
        // mode under the open area (that looped and closed the app).
        resetTo({ pathname: '/switch-mode', params: { to: needs } } as unknown as Href);
        return;
      }
      resetTo(`/${area}/(tabs)` as Href);
      return;
    }

    setPendingUrl(null);
    if (url.includes('/(tabs)')) {
      // A tab: back down to the tabs and switch to it. Pushing a tab URL from
      // a pushed screen used to create a second set of tabs.
      if (router.canDismiss()) router.dismissAll();
      router.navigate(url as Href);
    } else {
      router.push(url as Href);
    }
  }, [pendingUrl, isLoading, navReady, isAuthenticated, portal, doctor, refreshDoctor, router, segments]);

  return null;
}
