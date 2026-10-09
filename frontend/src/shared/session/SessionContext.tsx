import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

import { API_BASE_URL } from '../apiConfig';
import { setTokens as setAdminTokens } from '../../admin/lib/api';
import { clearTokens, getAccessToken, getRefreshToken, setTokens, type Mode } from './client';
import { doctorModeApi, userApi } from './clients';
import { landingPath, rememberMode } from './mode';
import { STAFF_ROLES, type Account, type DoctorRecord, type Profile } from './types';

/**
 * The signed-in person, shared by User mode (/patient) and Doctor mode
 * (/doctor) — the website's version of the mobile app's AuthContext.
 *
 * Mounted once above both modes, so switching between them is a route change
 * over data already loaded rather than a second sign-in. Staff accounts are
 * handed to the Admin Portal, which keeps its own separate session.
 */

type Snapshot = { account: Account; profiles: Profile[]; doctor: DoctorRecord | null };

export type VerifyResult = { kind: 'staff' } | { kind: 'member'; home: string };

type SessionValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Signed in, but the account couldn't be loaded (network, server asleep). */
  loadFailed: boolean;
  retryLoad: () => Promise<unknown>;

  account: Account | null;

  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (p: Profile) => void;
  refreshProfiles: () => Promise<Profile[]>;

  doctor: DoctorRecord | null;
  hasRegistered: boolean;
  refreshDoctor: () => Promise<DoctorRecord | null>;

  /** The mode the current page belongs to. */
  mode: Mode;

  sendOtp: (phone: string) => Promise<{ debug_otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<VerifyResult>;
  logout: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

async function fetchProfiles(): Promise<Profile[]> {
  // Always the account's OWN profiles. In doctor mode the same endpoint
  // also lists approved patients, who are not this person's family.
  const { data } = await userApi.get('/profiles/', { params: { acting_as: 'patient' } });
  return data.results ?? data;
}

async function fetchDoctor(): Promise<DoctorRecord | null> {
  try {
    const { data } = await doctorModeApi.get('/doctors/me/');
    return data;
  } catch (err) {
    // 404 means "has not registered as a doctor". Anything else is a real
    // failure, and must not be mistaken for that.
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

const ACTIVE_PROFILE_KEY = 'curapath_active_profile';

/** The family member last viewed on this browser, per account. */
function rememberedProfileId(accountId: string | undefined): string | null {
  if (!accountId) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_PROFILE_KEY) ?? 'null');
    return saved?.account === accountId ? saved.profile : null;
  } catch {
    return null;
  }
}

function rememberProfileId(accountId: string | undefined, profileId: string) {
  if (!accountId) return;
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify({ account: accountId, profile: profileId }));
  } catch {
    // Storage blocked: the first profile is still a sensible default.
  }
}

/** Same values as before? Then keep the old object, so effects keyed on it don't re-run. */
function sameProfile(a: Profile | null | undefined, b: Profile | null | undefined) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/** Moves a staff session into the Admin Portal's own store. */
function handOffToAdmin(access: string, refresh: string) {
  setAdminTokens(access, refresh);
  clearTokens();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [isLoading, setIsLoading] = useState(() => !!getAccessToken());
  const [loadFailed, setLoadFailed] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);

  const applyProfiles = useCallback((list: Profile[], accountId?: string) => {
    // Unchanged profiles keep their identity: every page keyed on the active
    // profile would otherwise refetch after any profile refresh.
    setProfiles((current) =>
      current.length === list.length && list.every((p, i) => sameProfile(p, current[i])) ? current : list
    );
    // Keep the same person selected (or the one last viewed on this browser)
    // but pull their latest values, so an edit in Settings shows up without
    // a reload. A removed profile falls back to the first one.
    setActiveProfileState((current) => {
      const wanted = current?.id ?? rememberedProfileId(accountId);
      const next = list.find((p) => p.id === wanted) ?? list[0] ?? null;
      return sameProfile(next, current) ? current : next;
    });
  }, []);

  const accountRef = useRef<Account | null>(null);
  accountRef.current = account;

  const setActiveProfile = useCallback((profile: Profile) => {
    setActiveProfileState(profile);
    rememberProfileId(accountRef.current?.id, profile.id);
  }, []);

  const load = useCallback(async (): Promise<Snapshot | null> => {
    setLoadFailed(false);
    // A retry must look like loading to the route guards, or they treat the
    // still-empty session as "no profile / not a doctor" and redirect away
    // from the page the person was on.
    setIsLoading(true);
    let handedOff = false;
    try {
      const { data: me } = await userApi.get<Account>('/auth/me/');
      if (STAFF_ROLES.includes(me.role)) {
        const access = getAccessToken();
        const refresh = getRefreshToken();
        if (access && refresh) handOffToAdmin(access, refresh);
        // Stay "loading" until the Admin Portal takes over, so no patient
        // page flashes in between; replace, so Back does not return here.
        handedOff = true;
        window.location.replace('/admin');
        return null;
      }
      const [list, doc] = await Promise.all([fetchProfiles(), fetchDoctor()]);
      setAccount(me);
      applyProfiles(list, me.id);
      setDoctor(doc);
      return { account: me, profiles: list, doctor: doc };
    } catch {
      // A dead session has already been cleared by the API client (which
      // also sends the browser to /login). Anything else — no network, the
      // server waking up — leaves the person signed in with a retry.
      if (getAccessToken()) setLoadFailed(true);
      else setIsAuthenticated(false);
      return null;
    } finally {
      if (!handedOff) setIsLoading(false);
    }
  }, [applyProfiles]);

  useEffect(() => {
    if (getAccessToken()) void load();
  }, [load]);

  const mode: Mode = location.pathname.startsWith('/doctor') ? 'doctor' : 'patient';

  // Remember the mode in use, so the next visit opens where this one left off.
  useEffect(() => {
    if (!account) return;
    if (location.pathname.startsWith('/patient') || (location.pathname.startsWith('/doctor') && doctor)) {
      rememberMode(account.id, mode);
    }
  }, [account, doctor, mode, location.pathname]);

  const refreshProfiles = useCallback(async () => {
    const list = await fetchProfiles();
    applyProfiles(list, account?.id);
    return list;
  }, [applyProfiles, account?.id]);

  const refreshDoctor = useCallback(async () => {
    const doc = await fetchDoctor();
    setDoctor(doc);
    return doc;
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    const { data } = await userApi.post('/auth/send-otp/', { phone_number: phone });
    return data;
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, otp: string): Promise<VerifyResult> => {
      const { data } = await userApi.post('/auth/verify-otp/', { phone_number: phone, otp });
      if (STAFF_ROLES.includes(data.account?.role)) {
        // Staff work in the Admin Portal, under its own session — handed
        // over directly, so a staff member does not enter a second code.
        handOffToAdmin(data.access, data.refresh);
        return { kind: 'staff' };
      }
      setTokens(data.access, data.refresh);
      setIsAuthenticated(true);
      setIsLoading(true);
      const snapshot = await load();
      // Signed in but not loaded: the root route shows the retry screen.
      return {
        kind: 'member',
        home: snapshot
          ? landingPath(snapshot.account.id, !!snapshot.doctor, snapshot.profiles.length)
          : '/',
      };
    },
    [load]
  );

  const logout = useCallback(() => {
    // End the session on the server too, without waiting on the network.
    // keepalive lets the request finish even though the page navigates to
    // /login straight after; plain fetch, so a 401 cannot start a refresh
    // of the session being ended.
    const refresh = getRefreshToken();
    if (refresh) {
      fetch(`${API_BASE_URL}/auth/logout/`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      }).catch(() => undefined);
    }
    clearTokens();
    // Every piece of session state, not just the flag, so nothing can paint
    // the previous person's name or records for a frame.
    setIsAuthenticated(false);
    setLoadFailed(false);
    setAccount(null);
    setProfiles([]);
    setActiveProfileState(null);
    setDoctor(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      isLoading,
      isAuthenticated,
      loadFailed,
      retryLoad: load,
      account,
      profiles,
      activeProfile,
      setActiveProfile,
      refreshProfiles,
      doctor,
      hasRegistered: !!doctor,
      refreshDoctor,
      mode,
      sendOtp,
      verifyOtp,
      logout,
    }),
    [
      isLoading, isAuthenticated, loadFailed, load, account, profiles, activeProfile,
      refreshProfiles, doctor, refreshDoctor, mode, sendOtp, verifyOtp, logout, setActiveProfile,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
