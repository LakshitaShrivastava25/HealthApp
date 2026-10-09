/**
 * User mode reads the one shared session (shared/session/SessionContext):
 * the same sign-in serves User and Doctor mode, as in the mobile app. Kept
 * as this module so every page's `useAuth()` import stays where it was.
 */
export { useSession as useAuth } from '@shared/session/SessionContext';
export type { Profile } from '@shared/session/types';
