import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, clearTokens, getAccessToken, getRefreshToken } from '../lib/api';

export type StaffAccount = {
  id: string;
  phone_number: string;
  role: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  staff: StaffAccount | null;
  logout: () => void;
};

const STAFF_ROLES = ['admin', 'ocr_reviewer', 'claims_ops'];

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The Admin Portal's own session. Staff sign in at /login like everyone
 * else; that screen recognises a staff account and hands its tokens to this
 * store (shared/session/SessionContext), so the portal has no sign-in page
 * of its own. Kept separate from the User/Doctor session so a staff session
 * is never mixed into a patient's.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const [staff, setStaff] = useState<StaffAccount | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
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
  }, [isAuthenticated]);

  const logout = () => {
    // End the session on the server too; fire-and-forget so signing out
    // never waits on the network.
    const refresh = getRefreshToken();
    if (refresh) authApi.logout(refresh).catch(() => undefined);
    clearTokens();
    // Clear the staff record too, so no stale phone number or role survives.
    setIsAuthenticated(false);
    setStaff(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, staff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
