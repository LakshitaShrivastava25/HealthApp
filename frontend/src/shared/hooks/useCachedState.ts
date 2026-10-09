import { useCallback, useState } from 'react';

/**
 * useState that remembers its last value per key for the rest of the visit.
 *
 * Pages used to start empty on every visit and show "No documents yet" (or
 * a setup form, or zero counts) until the request came back, then pop the
 * real data in — every navigation looked like a reload. With this, a page
 * opened before shows its last data instantly while its normal fetch
 * refreshes it quietly in the background.
 *
 * `loaded` is false only until the first value for this key arrives, so a
 * page can show a loader instead of a misleading empty state.
 *
 * Keys include the profile (and any filter), e.g. `locker:<profileId>:<tab>`,
 * so one family member's records never appear under another. A response
 * that arrives after the key changed is stored under its own key and does
 * not replace what is on screen.
 */

const cache = new Map<string, unknown>();

type Slot<T> = { key: string | null; value: T; loaded: boolean };

function read<T>(key: string | null, initial: T): Slot<T> {
  if (key !== null && cache.has(key)) return { key, value: cache.get(key) as T, loaded: true };
  return { key, value: initial, loaded: false };
}

export function useCachedState<T>(key: string | null, initial: T) {
  const [slot, setSlot] = useState<Slot<T>>(() => read(key, initial));

  let current = slot;
  if (slot.key !== key) {
    // The key changed (another profile or filter): show what is remembered
    // for it, or the initial value, straight away.
    current = read(key, initial);
    setSlot(current);
  }

  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      setSlot((previous) => {
        const base = previous.key === key ? previous.value : ((key !== null && cache.has(key) ? cache.get(key) : initial) as T);
        const value = typeof next === 'function' ? (next as (p: T) => T)(base) : next;
        if (key !== null) cache.set(key, value);
        // A late response for a key no longer on screen only updates the cache.
        if (previous.key !== key) return previous;
        return { key, value, loaded: true };
      });
    },
    // `initial` is a default value; a fresh literal each render must not
    // recreate the setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  return [current.value, set, current.loaded] as const;
}

/** Forget everything remembered (e.g. on logout — though that reloads anyway). */
export function clearCachedState() {
  cache.clear();
}
