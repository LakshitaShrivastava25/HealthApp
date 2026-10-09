import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { documentsApi, doctorAccessApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCachedState } from '@shared/hooks/useCachedState';

export type Notification = { id: string; text: string; tone: 'warning' | 'info' };

type Doc = { id: string; title: string; status: string };
type Grant = {
  id: string;
  status: string;
  doctor_detail: { full_name: string } | null;
};

/**
 * The notifications behind the header bell, derived from real records rather
 * than a notifications table: documents waiting on the person, documents
 * still being read, and doctors asking for access.
 *
 * This lives in a hook because the bell moved out of the Dashboard and into
 * Topbar, which every patient screen renders — the bell used to appear on
 * the Dashboard only, and a second, permanently disabled one sat in the
 * header everywhere else.
 *
 * Refetches when the active profile changes, when the tab regains focus,
 * and on navigation at most every REFRESH_MS — it used to refetch two full
 * lists on every single page change. The last result is remembered per
 * profile, so the badge is there immediately on every page. Failures
 * resolve to an empty list: a header decoration must never take a page
 * down with it.
 */
const REFRESH_MS = 20_000;
const lastFetched = new Map<string, number>();

export default function useNotifications(): Notification[] {
  const { activeProfile } = useAuth();
  const { pathname } = useLocation();
  const profileId = activeProfile?.id ?? null;
  const [notifications, setNotifications] = useCachedState<Notification[]>(
    profileId ? `notifications:${profileId}` : null,
    []
  );
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    const onFocus = () => setFocusTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    const last = lastFetched.get(profileId) ?? 0;
    if (Date.now() - last < REFRESH_MS) return;
    lastFetched.set(profileId, Date.now());
    let cancelled = false;

    Promise.all([
      documentsApi.list(profileId).then((r) => (r.data.results ?? r.data) as Doc[]).catch(() => [] as Doc[]),
      doctorAccessApi
        .listForProfile(profileId)
        .then((r) => (r.data.results ?? r.data) as Grant[])
        .catch(() => [] as Grant[]),
    ]).then(([documents, grants]) => {
      // A late response for a profile the person has already switched away
      // from would otherwise show the previous person's notifications.
      if (cancelled) return;
      setNotifications([
        ...documents
          .filter((d) => d.status === 'needs_review')
          .map((d) => ({ id: `doc-${d.id}`, text: `"${d.title}" needs your review`, tone: 'warning' as const })),
        ...documents
          .filter((d) => d.status === 'processing')
          .map((d) => ({ id: `proc-${d.id}`, text: `"${d.title}" is still processing`, tone: 'info' as const })),
        ...grants
          .filter((g) => g.status === 'pending')
          .map((g) => ({
            id: `access-${g.id}`,
            text: `Dr. ${g.doctor_detail?.full_name ?? 'A doctor'} has requested access to your records`,
            tone: 'info' as const,
          })),
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, [profileId, pathname, focusTick, setNotifications]);

  return notifications;
}

/** Makes the next navigation refetch the bell (after a document is confirmed, uploaded or deleted). */
export function refreshNotificationsSoon() {
  lastFetched.clear();
}
