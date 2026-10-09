import type { Mode } from './client';

/**
 * Which mode — User or Doctor — this browser last used, per account.
 *
 * Keyed by account so a second person signing in on the same browser never
 * inherits the first person's mode. Only a preference: whether Doctor mode
 * is available at all is decided by the account having a Doctor record.
 */

const MODE_KEY = 'curapath_last_mode';

export function rememberMode(accountId: string, mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, JSON.stringify({ account: accountId, mode }));
  } catch {
    // Storage blocked: the default below still gives a sensible landing.
  }
}

function rememberedMode(accountId: string): Mode | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MODE_KEY) ?? 'null');
    if (saved?.account === accountId && (saved.mode === 'patient' || saved.mode === 'doctor')) {
      return saved.mode;
    }
  } catch {
    // Unreadable value: fall through to the default.
  }
  return null;
}

/**
 * Where a signed-in person should land. Their last mode if they have one;
 * otherwise User mode, except for an account that registered as a doctor
 * and has no family profile yet — for them User mode would open on an
 * empty setup form, so Doctor mode is the natural start.
 */
export function preferredMode(accountId: string, hasDoctor: boolean, profileCount: number): Mode {
  const remembered = rememberedMode(accountId);
  if (remembered === 'doctor' && hasDoctor) return 'doctor';
  if (remembered === 'patient') return 'patient';
  return hasDoctor && profileCount === 0 ? 'doctor' : 'patient';
}

export function homeFor(mode: Mode) {
  return mode === 'doctor' ? '/doctor' : '/patient';
}

/** The first page for a signed-in account: its mode's home, or profile
 *  setup when User mode has no family profile to show yet. */
export function landingPath(accountId: string, hasDoctor: boolean, profileCount: number) {
  const mode = preferredMode(accountId, hasDoctor, profileCount);
  if (mode === 'patient' && profileCount === 0) return '/patient/setup';
  return homeFor(mode);
}
