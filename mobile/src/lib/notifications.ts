import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { medicinesApi, pushApi, unwrap } from './api';

/**
 * Everything notification-related on the phone, in two halves:
 *
 * 1. Push — the backend sends events (a doctor asking for access, an
 *    approval, a consultation note) through Expo's push service to the
 *    token registered here.
 * 2. Local — medicine reminders are scheduled on the phone itself from the
 *    reminder times already stored on the server, so they fire on the
 *    minute even with no network, and need no server-side scheduler.
 */

const MEDICINE_CHANNEL = 'medicine';
const DEFAULT_CHANNEL = 'default';

/** Marks the notifications this module schedules, so a resync only replaces its own. */
const MEDICINE_KIND = 'medicine_reminder';

// Show alerts while the app is open too; otherwise a reminder that fires
// while the person is looking at the app would silently vanish.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelsReady: Promise<void> | null = null;

function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelsReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
      name: 'Updates',
      description: 'Doctor requests, approvals and account updates',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#6D5BD0',
    });
    await Notifications.setNotificationChannelAsync(MEDICINE_CHANNEL, {
      name: 'Medicine reminders',
      description: 'Reminders to take your medicines on time',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6D5BD0',
    });
  })();
  return channelsReady;
}

/** Asks once; later calls just report the answer the person already gave. */
export async function ensurePermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

let registeredToken: string | null = null;

/**
 * Registers this phone with the backend for the signed-in account.
 *
 * Never throws: a phone without Google Play services, an emulator, or a
 * build without Firebase configured still gets local medicine reminders —
 * it just doesn't get server pushes.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (!(await ensurePermission())) return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await pushApi.register(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
  } catch (err) {
    console.warn('Push registration skipped:', err);
  }
}

/** Called before logout, while the session can still authenticate the request. */
export async function unregisterForPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await pushApi.unregister(token);
  } catch {
    // The token is also moved server-side when the next account registers it.
  }
}

// --- Medicine reminders ---------------------------------------------------

type Reminder = { id: string; time_of_day: string; days_of_week: string; is_active?: boolean };
type Medication = {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  end_date: string | null;
  is_active: boolean;
  reminders: Reminder[];
};

/** expo-notifications weekdays: 1 = Sunday … 7 = Saturday. */
const WEEKDAY: Record<string, number> = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function cancelMedicineReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === MEDICINE_KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Replaces this phone's medicine reminders with the ones stored for these
 * family members. Safe to call often — after login, after adding or
 * removing a medicine — it always rebuilds from the server's list.
 */
export async function syncMedicineReminders(
  profiles: { id: string; full_name: string; relation: string }[],
): Promise<void> {
  try {
    if (!(await ensurePermission())) return;
    const lists = await Promise.all(
      profiles.map(async (p) => ({
        profile: p,
        meds: unwrap<Medication>((await medicinesApi.list(p.id)).data),
      })),
    );

    await cancelMedicineReminders();
    const today = todayIso();

    for (const { profile, meds } of lists) {
      for (const med of meds) {
        if (!med.is_active || (med.end_date && med.end_date < today)) continue;
        for (const r of med.reminders) {
          if (r.is_active === false) continue;
          const [hour, minute] = r.time_of_day.split(':').map(Number);
          if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

          const forWhom = profile.relation === 'self' ? '' : ` for ${profile.full_name}`;
          const detail = [med.dosage, med.instructions].filter(Boolean).join(' · ');
          const content: Notifications.NotificationContentInput = {
            title: `Time for ${med.name}`,
            body: detail ? `${detail}${forWhom}` : `Tap to mark it taken${forWhom}.`,
            sound: 'default',
            data: { kind: MEDICINE_KIND, url: '/(patient)/(tabs)/medicines', profileId: profile.id },
          };

          const days = (r.days_of_week || 'daily').toLowerCase();
          if (days === 'daily') {
            await Notifications.scheduleNotificationAsync({
              content,
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                channelId: MEDICINE_CHANNEL,
              },
            });
          } else {
            for (const day of days.split(',').map((d) => WEEKDAY[d.trim().slice(0, 3)])) {
              if (!day) continue;
              await Notifications.scheduleNotificationAsync({
                content,
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  weekday: day,
                  hour,
                  minute,
                  channelId: MEDICINE_CHANNEL,
                },
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Medicine reminder sync failed:', err);
  }
}

/** On logout: the next person on this phone must not get these reminders. */
export async function clearLocalNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Nothing scheduled, or the module is unavailable — either way, done.
  }
}
