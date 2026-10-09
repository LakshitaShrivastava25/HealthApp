/**
 * Doctor mode reads the one shared session (shared/session/SessionContext):
 * a doctor signs in once, like any user, and switches into this mode. Kept
 * as this module so every page's `useAuth()` import stays where it was.
 */
export { useSession as useAuth } from '@shared/session/SessionContext';
export type { DoctorRecord } from '@shared/session/types';
