import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  authApi,
  doctorApi,
  profilesApi,
  setActingAs,
  setSessionExpiredHandler,
  unwrap,
  type Mode,
} from '../lib/api';
import { IS_PRODUCTION, setApiBaseUrl } from '../lib/config';
import { preferredMode, rememberMode, rememberActiveProfile, rememberedActiveProfile } from '../lib/mode';
import { clearLocalNotifications, unregisterForPush } from '../lib/notifications';
import { clearSessionCache, readSessionCache, writeSessionCache } from '../lib/sessionCache';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getStoredApiBaseUrl,
  setTokens,
  storeApiBaseUrl,
} from '../lib/tokens';

export type Role = 'patient' | 'doctor' | 'admin' | 'ocr_reviewer' | 'claims_ops';

export const STAFF_ROLES: Role[] = ['admin', 'ocr_reviewer', 'claims_ops'];

export type { Mode };

export type Account = {
  id: string;
  phone_number: string;
  email: string | null;
  role: Role;
  date_joined: string;
};

export type Profile = {
  id: string;
  full_name: string;
  relation: string;
  blood_group?: string;
  date_of_birth?: string | null;
  gender?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  preferred_language?: string;
  initials: string;
  /** Short, sayable patient code (e.g. "AB1234") a doctor enters to request access. */
  reference_code?: string;
};

export type DoctorRecord = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  verification_status: 'pending' | 'manual_review' | 'failed' | 'verified' | 'rejected';
  clinic_name: string;
  clinic_address: string;
  registration_number: string;
  state_council_id?: string;
  state_council_name?: string;
  registration_year?: number | null;
  /** Set by an admin when rejecting; shown so the doctor can correct it. */
  rejection_reason?: string;
  nmc_result?: '' | 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  nmc_name?: string;
  nmc_qualification?: string;
  booking_phone_number: string;
  consultation_fee: string | null;
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
};

/**
 * Which portal this session is showing.
 *
 * One login for everyone. Staff accounts go to the admin portal. Everyone
 * else signs in to User mode ('patient' — their own family's records) and,
 * once they have registered as a doctor, can switch to Doctor mode:
 * 'doctor-setup' while that registration is pending or rejected, 'doctor'
 * once an admin has verified it. The website follows the same flow
 * (frontend/src/shared/session).
 */
export type Portal = 'patient' | 'doctor' | 'doctor-setup' | 'admin';

type AuthValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  account: Account | null;
  portal: Portal | null;

  /** User ('patient') or Doctor mode. Doctor mode needs a Doctor record. */
  mode: Mode;
  switchMode: (mode: Mode) => void;

  // patient state
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (p: Profile) => void;
  refreshProfiles: () => Promise<Profile[]>;

  // doctor state
  doctor: DoctorRecord | null;
  hasRegistered: boolean;
  refreshDoctor: () => Promise<void>;

  sendOtp: (phone: string) => Promise<{ debug_otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<Account>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Same values? Then the old object is kept, so effects keyed on it don't re-run. */
function sameValue(a: unknown, b: unknown) {
  return a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));
}

function portalFor(account: Account | null, doctor: DoctorRecord | null, mode: Mode): Portal | null {
  if (!account) return null;
  if (STAFF_ROLES.includes(account.role)) return 'admin';
  if (mode === 'doctor' && doctor) {
    return doctor.verification_status === 'verified' ? 'doctor' : 'doctor-setup';
  }
  return 'patient';
}

/** True only when the server itself rejected the session — not for timeouts or no network. */
function isAuthRejection(err: unknown) {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

function isNotFound(err: unknown) {
  return (err as { response?: { status?: number } })?.response?.status === 404;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [hasRegistered, setHasRegistered] = useState(false);
  const [mode, setMode] = useState<Mode>('patient');
  // Whether a mode has been chosen for this signed-in session yet. A
  // background reload must not override a switch the person just made.
  const modeChosen = useRef(false);
  // Mirrors of state that switchMode reads. A screen that has just
  // registered calls refreshDoctor() and then switchMode('doctor') in the
  // same handler, before React re-renders — the state it closed over would
  // still say "not registered".
  const doctorRef = useRef<DoctorRecord | null>(null);
  const accountRef = useRef<Account | null>(null);

  /** The one place the mode changes: requests switch before screens do. */
  const applyMode = useCallback((next: Mode) => {
    setActingAs(next);
    setMode(next);
    modeChosen.current = true;
  }, []);

  const refreshProfiles = useCallback(async () => {
    // Always the account's own family, even from a Doctor-mode screen.
    const { data } = await profilesApi.listOwn();
    const list = unwrap<Profile>(data);
    // Unchanged profiles keep their identity. Every screen keyed on the
    // active profile used to refetch after any refresh — including the
    // background one on every cold start, so each start loaded twice.
    setProfiles((current) =>
      current.length === list.length && list.every((p, i) => sameValue(p, current[i])) ? current : list
    );
    setActiveProfileState((current) => {
      // Keep the same person selected but pull their latest values, so an
      // edit on the Settings screen shows up without a restart.
      const next = (current && list.find((p) => p.id === current.id)) ?? list[0] ?? null;
      return sameValue(next, current) ? current : next;
    });
    return list;
  }, []);

  /** Switches the family member on screen and remembers the choice for next launch. */
  const setActiveProfile = useCallback((profile: Profile) => {
    setActiveProfileState(profile);
    if (accountRef.current) void rememberActiveProfile(accountRef.current.id, profile.id);
  }, []);

  /** The account's Doctor record; null when it has not registered. */
  const loadDoctor = useCallback(async () => {
    try {
      const { data } = await doctorApi.me();
      doctorRef.current = data;
      setDoctor(data);
      setHasRegistered(true);
      return data as DoctorRecord;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // 404 simply means this account has not registered as a doctor yet.
      // Anything else (no signal, server asleep) keeps what we had, so a
      // doctor is never bounced out of Doctor mode by a dropped request.
      doctorRef.current = null;
      setDoctor(null);
      setHasRegistered(false);
      return null;
    }
  }, []);

  // Never throws, as before: a failed check keeps the record we already had.
  const refreshDoctor = useCallback(async () => {
    try {
      await loadDoctor();
    } catch {
      // Offline or server asleep — try again later.
    }
  }, [loadDoctor]);

  const loadSession = useCallback(async () => {
    const { data } = await authApi.me();
    const me = data as Account;
    accountRef.current = me;
    setAccount(me);
    if (STAFF_ROLES.includes(me.role)) return me;
    const [list, record] = await Promise.all([refreshProfiles(), loadDoctor()]);
    if (!modeChosen.current) {
      applyMode(await preferredMode(me.id, !!record, list.length));
    } else if (!record) {
      // Doctor mode without a Doctor record has nothing to show.
      applyMode('patient');
    }
    return me;
  }, [applyMode, loadDoctor, refreshProfiles]);

  const switchMode = useCallback(
    (next: Mode) => {
      // Doctor mode needs a Doctor record; without one there is nothing to
      // show and every request would act as a doctor for no reason.
      if (next === 'doctor' && !doctorRef.current) return;
      applyMode(next);
      if (accountRef.current) void rememberMode(accountRef.current.id, next);
    },
    [applyMode]
  );

  const logout = useCallback(async () => {
    // Unregister while the session can still authenticate the request, so
    // the next person to sign in on this phone doesn't get these alerts.
    await unregisterForPush();
    await clearLocalNotifications();
    clearSessionCache();
    // End the session on the server too. Best effort: offline, the phone
    // still signs out and the token simply lapses after 30 days unused. Not
    // awaited: the request already carries the token, so signing out never
    // waits on a slow network.
    const refresh = await getRefreshToken();
    if (refresh) void authApi.logout(refresh).catch(() => undefined);
    await clearTokens();
    accountRef.current = null;
    doctorRef.current = null;
    setAccount(null);
    setProfiles([]);
    setActiveProfileState(null);
    setDoctor(null);
    setHasRegistered(false);
    setActingAs('patient');
    setMode('patient');
    modeChosen.current = false;
  }, []);

  // Keep a copy of the loaded session so the next launch can open straight
  // into the app. Written whenever it changes (login, a family member
  // added, a doctor profile edited), never while signed out.
  useEffect(() => {
    if (!account) return;
    writeSessionCache({ account, profiles, doctor });
  }, [account, profiles, doctor]);

  // Restore a session on cold start, and let the API layer end it if a
  // refresh token turns out to be dead.
  //
  // A returning user is shown their last session straight away and the
  // live one is fetched behind it, so opening the app never waits on the
  // server. Only a real rejection from the server signs them out — a
  // timeout or no signal just leaves the saved session in place.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void logout();
    });
    (async () => {
      // The "Can't connect?" server override is a development aid. A value
      // left behind by a development build must never redirect a release
      // build's tokens and records to some other machine.
      const storedBaseUrl = await getStoredApiBaseUrl();
      if (storedBaseUrl && !IS_PRODUCTION) setApiBaseUrl(storedBaseUrl);
      else if (storedBaseUrl) await storeApiBaseUrl(null);

      const token = await getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const cached = await readSessionCache<Account, Profile, DoctorRecord>();
      if (cached?.account) {
        const cachedProfiles = cached.profiles ?? [];
        accountRef.current = cached.account;
        doctorRef.current = cached.doctor ?? null;
        setAccount(cached.account);
        setProfiles(cachedProfiles);
        // The family member viewed last time, not always the first one.
        const rememberedId = await rememberedActiveProfile(cached.account.id);
        setActiveProfileState(cachedProfiles.find((p) => p.id === rememberedId) ?? cachedProfiles[0] ?? null);
        setDoctor(cached.doctor ?? null);
        setHasRegistered(!!cached.doctor);
        if (!STAFF_ROLES.includes(cached.account.role)) {
          applyMode(await preferredMode(cached.account.id, !!cached.doctor, cachedProfiles.length));
        }
        setIsLoading(false);
        loadSession().catch(() => {
          // Offline or server asleep: keep showing the saved session. A dead
          // login is handled by the API layer's session-expired handler.
        });
        return;
      }

      // No saved copy yet (first launch after installing this version):
      // wait for the server, retrying while a sleeping backend wakes up.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await loadSession();
          break;
        } catch (err) {
          if (isAuthRejection(err)) {
            await clearTokens();
            break;
          }
          if (attempt < 3) await wait(3000 * (attempt + 1));
        }
      }
      setIsLoading(false);
    })();
    return () => setSessionExpiredHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    const { data } = await authApi.sendOtp(phone);
    return data;
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, otp: string) => {
      const { data } = await authApi.verifyOtp(phone, otp);
      await setTokens(data.access, data.refresh);
      // A fresh sign-in picks its mode afresh (the last one this account
      // used on this phone, else User mode).
      modeChosen.current = false;
      // Read the session back through /auth/me/ rather than trusting the
      // login payload alone, so the profiles and any Doctor record are
      // loaded before the router decides which portal to show and no frame
      // renders the wrong one.
      return loadSession();
    },
    [loadSession]
  );

  const value = useMemo<AuthValue>(
    () => ({
      isLoading,
      isAuthenticated: !!account,
      account,
      portal: portalFor(account, doctor, mode),
      mode,
      switchMode,
      profiles,
      activeProfile,
      setActiveProfile,
      refreshProfiles,
      doctor,
      hasRegistered,
      refreshDoctor,
      sendOtp,
      verifyOtp,
      logout,
    }),
    [
      isLoading, account, doctor, mode, switchMode, profiles, activeProfile,
      refreshProfiles, hasRegistered, refreshDoctor, sendOtp, verifyOtp, logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
