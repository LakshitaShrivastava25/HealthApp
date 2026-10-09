import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { dataVersion } from '../lib/dataVersion';

export const FOCUS_REFRESH_MS = 30_000;

/**
 * Loads a screen's data when it comes into focus — but not again on every
 * tab switch. It reloads when:
 *   - `key` changed (another family member, another filter), or
 *   - the app changed something on the server since the last load, or
 *   - the last load is older than `minIntervalMs`.
 *
 * Every tab used to refetch everything on every focus (the home tab alone
 * fired 7 requests each time), which on a sleeping server felt like the app
 * reloading again and again. Pull-to-refresh should call `load` directly.
 */
export function useFocusRefresh(load: () => unknown, key: string | null, minIntervalMs = FOCUS_REFRESH_MS) {
  const last = useRef<{ key: string; at: number; version: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (key === null) return;
      const now = Date.now();
      const previous = last.current;
      if (
        previous &&
        previous.key === key &&
        previous.version === dataVersion() &&
        now - previous.at < minIntervalMs
      ) {
        return;
      }
      last.current = { key, at: now, version: dataVersion() };
      void load();
    }, [load, key, minIntervalMs])
  );
}
