/**
 * Runs a token refresh under a lock shared by every tab of this origin.
 *
 * The backend rotates refresh tokens and blacklists the one it replaced, and
 * all tabs share one localStorage. Two tabs refreshing with the same token at
 * once would leave the slower one holding a blacklisted token, and its
 * failure would log every tab out. With the lock the second tab waits, then
 * finds the first tab's fresh tokens already in storage and reuses them.
 */
export function withRefreshLock<T>(name: string, refresh: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(name, refresh);
  }
  return refresh();
}
