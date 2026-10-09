import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { doctorAccessApi, documentsApi, unwrap } from '../lib/api';
import { dataVersion } from '../lib/dataVersion';
import { FOCUS_REFRESH_MS } from './useFocusRefresh';

export type AppNotification = {
  id: string;
  kind: 'document' | 'access';
  text: string;
  tone: 'warning' | 'info';
  href: Href;
};

type Doc = { id: string; title: string; status: string };
type Grant = {
  id: string;
  status: string;
  doctor_detail: { full_name: string } | null;
};

/**
 * Pure derivation shared by the hook and the Dashboard (which already has
 * documents and grants loaded and should not fetch them a second time).
 */
export function deriveNotifications(documents: Doc[], grants: Grant[]): AppNotification[] {
  return [
    ...documents
      .filter((d) => d.status === 'needs_review')
      .map((d) => ({
        id: `doc-${d.id}`,
        kind: 'document' as const,
        text: `"${d.title || 'Untitled document'}" needs your review`,
        tone: 'warning' as const,
        href: `/(patient)/document/${d.id}` as Href,
      })),
    ...documents
      .filter((d) => d.status === 'processing')
      .map((d) => ({
        id: `proc-${d.id}`,
        kind: 'document' as const,
        text: `"${d.title || 'Untitled document'}" is still processing`,
        tone: 'info' as const,
        href: `/(patient)/document/${d.id}` as Href,
      })),
    ...grants
      .filter((g) => g.status === 'pending')
      .map((g) => ({
        id: `access-${g.id}`,
        kind: 'access' as const,
        text: `Dr. ${g.doctor_detail?.full_name ?? 'A doctor'} has requested access to your records`,
        tone: 'info' as const,
        href: '/(patient)/doctor-access' as Href,
      })),
  ];
}

/**
 * The notifications behind the header bell — mobile port of the web app's
 * frontend/src/patient/hooks/useNotifications.ts. Derived from real records
 * rather than a notifications table: documents waiting on the person,
 * documents still being read, and doctors asking for access.
 *
 * One shared result per profile for every bell on screen: each tab header
 * has its own bell, and each used to fetch two full lists on every focus.
 * Now they share one request, reused for FOCUS_REFRESH_MS unless something
 * was changed on the server meanwhile (dataVersion). Tapping the bell
 * always refreshes. Late responses for a profile the person already switched
 * away from are dropped. Failures resolve to an empty list: a header
 * decoration must never take a screen down with it.
 */
type Shared = { at: number; version: number; value: AppNotification[]; inFlight?: Promise<AppNotification[]> };
const shared = new Map<string, Shared>();

function loadShared(profileId: string, force: boolean): Promise<AppNotification[]> {
  const entry = shared.get(profileId);
  if (entry?.inFlight) return entry.inFlight;
  if (entry && !force && entry.version === dataVersion() && Date.now() - entry.at < FOCUS_REFRESH_MS) {
    return Promise.resolve(entry.value);
  }
  const version = dataVersion();
  const inFlight = Promise.all([
    documentsApi
      .list(profileId)
      .then((r) => unwrap<Doc>(r.data))
      .catch(() => [] as Doc[]),
    doctorAccessApi
      .listForProfile(profileId)
      .then((r) => unwrap<Grant>(r.data))
      .catch(() => [] as Grant[]),
  ]).then(([documents, grants]) => {
    const value = deriveNotifications(documents, grants);
    shared.set(profileId, { at: Date.now(), version, value });
    return value;
  });
  shared.set(profileId, { at: entry?.at ?? 0, version: entry?.version ?? -1, value: entry?.value ?? [], inFlight });
  return inFlight;
}

export default function useNotifications(): { notifications: AppNotification[]; refresh: () => void } {
  const { activeProfile } = useAuth();
  const profileId = activeProfile?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>(
    () => (profileId ? shared.get(profileId)?.value : undefined) ?? []
  );
  const requestId = useRef(0);

  const load = useCallback(
    (force: boolean) => {
      const id = ++requestId.current;
      if (!profileId) {
        setNotifications([]);
        return;
      }
      void loadShared(profileId, force).then((value) => {
        // Only the newest request may write: an older one resolving late would
        // otherwise show the previous person's notifications.
        if (id === requestId.current) setNotifications(value);
      });
    },
    [profileId]
  );

  // On focus, and again while focused whenever the active profile switches.
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  // Invalidate any in-flight request on unmount.
  useEffect(
    () => () => {
      requestId.current++;
    },
    []
  );

  const refresh = useCallback(() => load(true), [load]);
  return { notifications, refresh };
}
