import { getRefreshToken as getAdminRefreshToken } from '../../admin/lib/api';
import { getRefreshToken as getUserRefreshToken } from './client';

/**
 * One portal per browser at a time.
 *
 * The User Portal (/, /patient, /doctor, /login…) and the Admin Portal
 * (/admin…) keep separate sessions, so editing the address bar used to move a
 * signed-in person straight into the other portal's sign-in page or pages.
 * Now whichever portal the browser is signed into owns it until that session
 * ends: a user who types /admin lands back on their own home, an admin who
 * types /patient or /doctor lands back in the Admin Portal. Logging out (or
 * the session lapsing after 30 days unused) releases the lock.
 *
 * "Signed in" means a refresh token is held — that is what keeps a session
 * alive for its 30 days. A token the server has since refused is cleared by
 * the portal that tried it, which releases the lock too.
 *
 * Both held (only possible from before this lock existed): the Admin Portal
 * wins, the stricter of the two.
 */
export type SignedInPortal = 'user' | 'admin' | null;

export function signedInPortal(): SignedInPortal {
  try {
    if (getAdminRefreshToken()) return 'admin';
    if (getUserRefreshToken()) return 'user';
  } catch {
    // Storage blocked (private mode, site data off): nothing is signed in.
  }
  return null;
}

/** Pages anyone may open whoever is signed in: linked from the stores and both apps. */
export const PUBLIC_PATHS = ['/privacy', '/terms', '/delete-account'];
