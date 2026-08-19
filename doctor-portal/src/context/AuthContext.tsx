import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, clearTokens, getAccessToken, setTokens, doctorApi } from '../lib/api';

export type DoctorRecord = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  verification_status: 'pending' | 'verified' | 'rejected';
  clinic_name: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  doctor: DoctorRecord | null;
  hasRegistered: boolean;
  refreshDoctor: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ debug_otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [hasRegistered, setHasRegistered] = useState(false);

  async function refreshDoctor() {
    try {
      const { data } = await doctorApi.me();
      setDoctor(data);
      setHasRegistered(true);
    } catch {
      setDoctor(null);
      setHasRegistered(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      refreshDoctor().finally(() => setIsLoading(false));
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
  };

  const logout = () => {
    clearTokens();
    setIsAuthenticated(false);
    setDoctor(null);
    setHasRegistered(false);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, doctor, hasRegistered, refreshDoctor, sendOtp, verifyOtp, logout }}
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
