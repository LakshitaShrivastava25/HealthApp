import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, clearTokens, getAccessToken, setTokens } from '../lib/api';

export type StaffAccount = {
  id: string;
  phone_number: string;
  role: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  staff: StaffAccount | null;
  sendOtp: (phone: string) => Promise<{ debug_otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
};

const STAFF_ROLES = ['admin', 'ocr_reviewer', 'claims_ops'];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const [staff, setStaff] = useState<StaffAccount | null>(null);

  async function loadMe() {
    try {
      const { data } = await authApi.me();
      setStaff(data);
      return data;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadMe().finally(() => setIsLoading(false));
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
    // Check the role BEFORE committing to a session — a patient account
    // must never be let into the Admin Portal just because OTP succeeded.
    if (!STAFF_ROLES.includes(data.account?.role)) {
      return { ok: false, error: 'This account does not have staff access.' };
    }
    setTokens(data.access, data.refresh);
    setStaff(data.account);
    setIsAuthenticated(true);
    return { ok: true };
  };

  const logout = () => {
    clearTokens();
    // Clear the staff record too, so no stale phone number or role survives.
    setIsAuthenticated(false);
    setStaff(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, staff, sendOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
