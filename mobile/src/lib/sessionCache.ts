import { File, Paths } from 'expo-file-system';

/**
 * The last session this phone loaded — account, family profiles, doctor
 * record — kept so a returning user sees the app immediately instead of
 * waiting on the server (a free-tier backend can take most of a minute to
 * wake up). The live session is still fetched right after and replaces it.
 *
 * Kept in the app's private cache folder rather than SecureStore, which is
 * meant for small secrets and warns above ~2 KB; the credentials themselves
 * stay in SecureStore (see tokens.ts). The cache folder, not documents: iOS
 * includes Documents in iCloud backups, and names, dates of birth and blood
 * groups have no business in a backup. If the OS clears the cache, the cost
 * is one slower launch.
 */

const file = () => new File(Paths.cache, 'session-cache.json');
// Where earlier versions kept it. Removed on sight, so personal details do
// not linger in a backed-up folder after this update.
const legacyFile = () => new File(Paths.document, 'session-cache.json');

function removeLegacyCopy() {
  try {
    const f = legacyFile();
    if (f.exists) f.delete();
  } catch {
    // Nothing to remove.
  }
}

export type SessionSnapshot<A, P, D> = { account: A; profiles: P[]; doctor: D | null };

export async function readSessionCache<A, P, D>(): Promise<SessionSnapshot<A, P, D> | null> {
  removeLegacyCopy();
  try {
    const f = file();
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as SessionSnapshot<A, P, D>;
  } catch {
    return null;
  }
}

export function writeSessionCache<A, P, D>(snapshot: SessionSnapshot<A, P, D>) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(snapshot));
  } catch {
    // A missing cache only costs one slower launch.
  }
}

export function clearSessionCache() {
  removeLegacyCopy();
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Nothing to clear.
  }
}
