import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  authApi,
  doctorApi,
  profilesApi,
  setSessionExpiredHandler,
  unwrap,
} from '../lib/api';
import { setApiBaseUrl } from '../lib/config';
import { clearTokens, getAccessToken, getStoredApiBaseUrl, setTokens } from '../lib/tokens';

export type Role = 'patient' | 'doctor' | 'admin' | 'ocr_reviewer' | 'claims_ops';

export const STAFF_ROLES: Role[] = ['admin', 'ocr_reviewer', 'claims_ops'];

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
};

export type DoctorRecord = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  verification_status: 'pending' | 'verified' | 'rejected';
  clinic_name: string;
  clinic_address: string;
  registration_number: string;
  booking_phone_number: string;
  consultation_fee: string | null;
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
};

/**
 * Which portal this session belongs in.
 *
 * The web app runs three portals with three separate token stores, because
 * they are three routes on one origin that one browser might hold open at
 * once. A phone is one person holding one session, so there is one login
 * here and the account's role decides where it lands. 'doctor-setup' is the
 * state where the account is flagged as a doctor but the Doctor record is
 * incomplete or unverified — the same gate DoctorApp.tsx applies on web.
 */
export type Portal = 'patient' | 'doctor' | 'doctor-setup' | 'admin';

type AuthValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  account: Account | null;
  portal: Portal | null;

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

function portalForAccount(account: Account | null, doctor: DoctorRecord | null): Portal | null {
  if (!account) return null;
  if (STAFF_ROLES.includes(account.role)) return 'admin';
  if (account.role === 'doctor') {
    return doctor && doctor.verification_status === 'verified' ? 'doctor' : 'doctor-setup';
  }
  return 'patient';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [hasRegistered, setHasRegistered] = useState(false);

  const refreshProfiles = useCallback(async () => {
    const { data } = await profilesApi.list();
    const list = unwrap<Profile>(data);
    setProfiles(list);
    setActiveProfile((current) => {
      if (!current) return list[0] ?? null;
      // Keep the same person selected but pull their latest values, so an
      // edit on the Settings screen shows up without a restart.
      return list.find((p) => p.id === current.id) ?? list[0] ?? null;
    });
    return list;
  }, []);

  const refreshDoctor = useCallback(async () => {
    try {
      const { data } = await doctorApi.me();
      setDoctor(data);
      setHasRegistered(true);
    } catch {
      // 404 simply means this account has not registered as a doctor yet.
      setDoctor(null);
      setHasRegistered(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    const { data } = await authApi.me();
    const me = data as Account;
    setAccount(me);
    if (me.role === 'doctor') {
      await refreshDoctor();
    } else if (!STAFF_ROLES.includes(me.role)) {
      await refreshProfiles();
    }
    return me;
  }, [refreshDoctor, refreshProfiles]);

  const logout = useCallback(async () => {
    await clearTokens();
    setAccount(null);
    setProfiles([]);
    setActiveProfile(null);
    setDoctor(null);
    setHasRegistered(false);
  }, []);

  // Restore a session on cold start, and let the API layer end it if a
  // refresh token turns out to be dead.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void logout();
    });
    (async () => {
      const storedBaseUrl = await getStoredApiBaseUrl();
      if (storedBaseUrl) setApiBaseUrl(storedBaseUrl);

      const token = await getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        await loadSession();
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    })();
    return () => setSessionExpiredHandler(null);
  }, [loadSession, logout]);

  const sendOtp = useCallback(async (phone: string) => {
    const { data } = await authApi.sendOtp(phone);
    return data;
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, otp: string) => {
      const { data } = await authApi.verifyOtp(phone, otp);
      await setTokens(data.access, data.refresh);
      // Read the session back through /auth/me/ rather than trusting the
      // login payload alone, so a doctor's record is loaded before the
      // router decides which portal to show and no frame renders the
      // wrong one.
      return loadSession();
    },
    [loadSession]
  );

  const value = useMemo<AuthValue>(
    () => ({
      isLoading,
      isAuthenticated: !!account,
      account,
      portal: portalForAccount(account, doctor),
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
      isLoading, account, doctor, profiles, activeProfile,
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
