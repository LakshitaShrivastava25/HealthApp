import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { documentsApi, doctorAccessApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

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
 * Refetches when the active profile changes (these are per-person) and on
 * navigation, so confirming a document and moving on updates the count
 * without a reload. Failures resolve to an empty list: a header decoration
 * must never take a page down with it.
 */
export default function useNotifications(): Notification[] {
  const { activeProfile } = useAuth();
  const { pathname } = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!activeProfile) {
      setNotifications([]);
      return;
    }
    let cancelled = false;

    Promise.all([
      documentsApi.list(activeProfile.id).then((r) => (r.data.results ?? r.data) as Doc[]).catch(() => [] as Doc[]),
      doctorAccessApi
        .listForProfile(activeProfile.id)
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
  }, [activeProfile, pathname]);

  return notifications;
}
