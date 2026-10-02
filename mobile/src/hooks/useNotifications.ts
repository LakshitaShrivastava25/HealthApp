import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { doctorAccessApi, documentsApi, unwrap } from '../lib/api';

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
 * Refetches when the active profile changes (these are per-person) and
 * whenever the screen hosting it regains focus, so confirming a document
 * and coming back updates the count. Late responses for a profile the
 * person already switched away from are dropped. Failures resolve to an
 * empty list: a header decoration must never take a screen down with it.
 */
export default function useNotifications(): { notifications: AppNotification[]; refresh: () => void } {
  const { activeProfile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    if (!activeProfile) {
      setNotifications([]);
      return;
    }
    const profileId = activeProfile.id;
    void Promise.all([
      documentsApi
        .list(profileId)
        .then((r) => unwrap<Doc>(r.data))
        .catch(() => [] as Doc[]),
      doctorAccessApi
        .listForProfile(profileId)
        .then((r) => unwrap<Grant>(r.data))
        .catch(() => [] as Grant[]),
    ]).then(([documents, grants]) => {
      // Only the newest request may write: an older one resolving late would
      // otherwise show the previous person's notifications.
      if (id !== requestId.current) return;
      setNotifications(deriveNotifications(documents, grants));
    });
  }, [activeProfile]);

  // Re-runs on focus, and again while focused whenever `refresh` changes
  // (i.e. the active profile switched).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Invalidate any in-flight request on unmount.
  useEffect(
    () => () => {
      requestId.current++;
    },
    []
  );

  return { notifications, refresh };
}
