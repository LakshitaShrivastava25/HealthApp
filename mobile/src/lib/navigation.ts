import { router, type Href } from 'expo-router';

/**
 * Leaves the current area for good (sign in / out, switch mode, finish
 * registration): pops every pushed screen first, then replaces what is left.
 *
 * A plain router.replace() only swaps the top screen. Anything pushed
 * underneath (e.g. the patient tabs under the doctor registration form)
 * stayed in the stack, and Back later landed on it — the area's guard then
 * redirected, so Back seemed to bounce or show a duplicate home screen.
 */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}
