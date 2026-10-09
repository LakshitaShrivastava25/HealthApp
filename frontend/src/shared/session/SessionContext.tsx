import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);

  const applyProfiles = useCallback((list: Profile[]) => {
    setProfiles(list);
    // Keep the same person selected but pull their latest values, so an edit
    // in Settings shows up without a reload. A removed profile falls back
    // to the first one rather than lingering on screen.
    setActiveProfile((current) =>
      current ? (list.find((p) => p.id === current.id) ?? list[0] ?? null) : (list[0] ?? null)
    );
  }, []);

  const load = useCallback(async (): Promise<Snapshot | null> => {
    setLoadFailed(false);
    try {
      const { data: me } = await userApi.get<Account>('/auth/me/');
      if (STAFF_ROLES.includes(me.role)) {
        const access = getAccessToken();
        const refresh = getRefreshToken();
        if (access && refresh) handOffToAdmin(access, refresh);
        window.location.assign('/admin');
        return null;
      }
      const [list, doc] = await Promise.all([fetchProfiles(), fetchDoctor()]);
      setAccount(me);
      applyProfiles(list);
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
      setIsLoading(false);
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
    applyProfiles(list);
    return list;
  }, [applyProfiles]);

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
    // End the session on the server too; fire-and-forget so signing out
    // never waits on the network. Plain axios: a 401 here must not start a
    // refresh of the session being ended.
    const refresh = getRefreshToken();
    if (refresh) axios.post(`${API_BASE_URL}/auth/logout/`, { refresh }).catch(() => undefined);
    clearTokens();
    // Every piece of session state, not just the flag, so nothing can paint
    // the previous person's name or records for a frame.
    setIsAuthenticated(false);
    setLoadFailed(false);
    setAccount(null);
    setProfiles([]);
    setActiveProfile(null);
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
      refreshProfiles, doctor, refreshDoctor, mode, sendOtp, verifyOtp, logout,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
