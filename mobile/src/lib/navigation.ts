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
  // canDismiss() can answer yes while the focused navigator still cannot
  // perform the action — signing out from a tab screen raises
  // "POP_TO_TOP was not handled", which surfaces as a red box in dev and
  // is pure noise: the replace below is what actually matters, and it
  // works either way.
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // Nothing to dismiss, or no navigator willing to. Carry on.
  }
  router.replace(href);
}
