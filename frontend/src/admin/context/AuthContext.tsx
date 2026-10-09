import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, clearTokens, getAccessToken, getRefreshToken, setTokens } from '../lib/api';

export type StaffAccount = {
  id: string;
  phone_number: string;
  email?: string | null;
  role: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  staff: StaffAccount | null;
  /** Email + password sign-in (the /admin sign-in page). Throws on failure. */
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const STAFF_ROLES = ['admin', 'ocr_reviewer', 'claims_ops'];

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The Admin Portal's own session, kept separate from the User/Doctor
 * session so a staff session is never mixed into a patient's.
 *
 * Two ways in: the portal's own email + password sign-in at /admin
 * (loginWithPassword), or the shared /login screen, which recognises a
 * staff account after OTP and hands its tokens to this store
 * (shared/session/SessionContext).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [isLoading, setIsLoading] = useState(!!getAccessToken());
  const [staff, setStaff] = useState<StaffAccount | null>(null);

  useEffect(() => {
    // Signed in with a password just now: the account came with the tokens.
    if (!isAuthenticated || staff) {
      setIsLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ data }) => {
        // Only ever a staff account in here. The server refuses every admin
        // endpoint to anyone else regardless; this just keeps the portal
        // from rendering around the wrong session.
        if (STAFF_ROLES.includes(data.role)) {
          setStaff(data);
        } else {
          clearTokens();
          setIsAuthenticated(false);
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [isAuthenticated, staff]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.staffLogin(email, password);
    if (!STAFF_ROLES.includes(data.account?.role)) {
      throw new Error('not-staff');
    }
    setTokens(data.access, data.refresh);
    setStaff(data.account);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    // End the session on the server too; fire-and-forget so signing out
    // never waits on the network.
    const refresh = getRefreshToken();
    if (refresh) authApi.logout(refresh).catch(() => undefined);
    clearTokens();
    // Clear the staff record too, so no stale phone number or role survives.
    setIsAuthenticated(false);
    setStaff(null);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, isLoading, staff, loginWithPassword, logout }),
    [isAuthenticated, isLoading, staff, loginWithPassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
