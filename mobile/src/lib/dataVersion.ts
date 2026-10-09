/**
 * A counter that goes up whenever the app successfully changes something on
 * the server (any non-GET request — see the response interceptor in api.ts).
 *
 * Screens refresh on focus only when their data is old or this counter has
 * moved since they last loaded (src/hooks/useFocusRefresh.ts): switching
 * tabs no longer refetches everything every time, yet confirming a document
 * and going back to the Locker still shows the change immediately.
 */
let version = 0;

export function bumpDataVersion() {
  version += 1;
}

export function dataVersion() {
  return version;
}
