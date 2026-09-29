import { File, Paths } from 'expo-file-system';

/**
 * The last session this phone loaded — account, family profiles, doctor
 * record — kept so a returning user sees the app immediately instead of
 * waiting on the server (a free-tier backend can take most of a minute to
 * wake up). The live session is still fetched right after and replaces it.
 *
 * Kept in the app's private documents folder rather than SecureStore,
 * which is meant for small secrets and warns above ~2 KB; the credentials
 * themselves stay in SecureStore (see tokens.ts).
 */

const file = () => new File(Paths.document, 'session-cache.json');

export type SessionSnapshot<A, P, D> = { account: A; profiles: P[]; doctor: D | null };

export async function readSessionCache<A, P, D>(): Promise<SessionSnapshot<A, P, D> | null> {
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
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Nothing to clear.
  }
}
