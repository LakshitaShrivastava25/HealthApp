import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, clearTokens, getAccessToken, profilesApi, setTokens } from '../lib/api';

export type Profile = {
  id: string;
  full_name: string;
  relation: string;
  blood_group?: string;
  /** Short shareable patient code, e.g. "AB1234". Server-generated. */
  reference_code?: string;
  date_of_birth?: string | null;
  gender?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  preferred_language?: string;
  initials: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (p: Profile) => void;
  refreshProfiles: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ debug_otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<string | undefined>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);

  const refreshProfiles = async () => {
    const { data } = await profilesApi.list();
    const list: Profile[] = data.results ?? data;
    setProfiles(list);
    setActiveProfileState((current) => {
      if (!current) return list[0] ?? null;
      // Keep the same active profile selected, but pull its latest data
      // (e.g. after a Settings edit) rather than leaving stale fields
      // displayed until a full page reload.
      const updated = list.find((p) => p.id === current.id);
      return updated ?? current;
    });
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshProfiles().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const sendOtp = async (phone: string) => {
    const { data } = await authApi.sendOtp(phone);
    return data;
  };

  const verifyOtp = async (phone: string, otp: string) => {
    const { data } = await authApi.verifyOtp(phone, otp);
    setTokens(data.access, data.refresh);
    setIsAuthenticated(true);
    return data.account?.role as string | undefined;
  };

  const logout = () => {
    clearTokens();
    setIsAuthenticated(false);
    setProfiles([]);
    setActiveProfileState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        profiles,
        activeProfile,
        setActiveProfile: setActiveProfileState,
        refreshProfiles,
        sendOtp,
        verifyOtp,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
