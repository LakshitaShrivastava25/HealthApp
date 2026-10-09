import * as SecureStore from 'expo-secure-store';

import type { Mode } from './api';

/**
 * Which mode — User or Doctor — this phone last used, per account.
 *
 * Keyed by account so someone else signing in on the same phone never
 * inherits it. Only a preference: Doctor mode also needs the account to have
 * a Doctor record. The website applies the same rule (shared/session/mode.ts).
 */

const MODE_KEY = 'curapath_last_mode';

export async function rememberMode(accountId: string, mode: Mode) {
  try {
    await SecureStore.setItemAsync(MODE_KEY, JSON.stringify({ account: accountId, mode }));
  } catch {
    // Not remembered: the default below still gives a sensible landing.
  }
}

async function rememberedMode(accountId: string): Promise<Mode | null> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(MODE_KEY)) ?? 'null');
    if (saved?.account === accountId && (saved.mode === 'patient' || saved.mode === 'doctor')) {
      return saved.mode;
    }
  } catch {
    // Unreadable value: fall through to the default.
  }
  return null;
}

/**
 * The mode to open in: the last one used, otherwise User mode — except for
 * an account that registered as a doctor and has no family profile yet, for
 * whom User mode would open on an empty setup form.
 */
export async function preferredMode(accountId: string, hasDoctor: boolean, profileCount: number): Promise<Mode> {
  const remembered = await rememberedMode(accountId);
  if (remembered === 'doctor' && hasDoctor) return 'doctor';
  if (remembered === 'patient') return 'patient';
  return hasDoctor && profileCount === 0 ? 'doctor' : 'patient';
}

const ACTIVE_PROFILE_KEY = 'curapath_active_profile';

/** The family member last viewed on this phone, per account. */
export async function rememberActiveProfile(accountId: string, profileId: string) {
  try {
    await SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, JSON.stringify({ account: accountId, profile: profileId }));
  } catch {
    // Not remembered: the first profile is still a sensible default.
  }
}

export async function rememberedActiveProfile(accountId: string): Promise<string | null> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(ACTIVE_PROFILE_KEY)) ?? 'null');
    return saved?.account === accountId && typeof saved.profile === 'string' ? saved.profile : null;
  } catch {
    return null;
  }
}
