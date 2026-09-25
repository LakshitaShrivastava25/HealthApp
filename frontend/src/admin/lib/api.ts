import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const api = axios.create({ baseURL: BASE_URL });

// Separate localStorage keys from the User Portal — an admin and a patient
// could plausibly be open in different tabs of the same browser profile,
// and these must never collide or overwrite each other.
const ACCESS_KEY = 'healthnow_admin_access_token';
const REFRESH_KEY = 'healthnow_admin_refresh_token';

// Shared by clearTokens() and the 401 interceptor below.
let isRefreshing = false;
let pendingQueue: (() => void)[] = [];

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
/**
 * Bumped by clearTokens(). The 401 interceptor captures it before awaiting
 * the refresh call and re-checks it afterwards, so a refresh that was
 * already in flight when someone logged out can no longer write its result
 * back into storage. Without this, logout during an in-flight refresh
 * silently restored the whole session — the intermittent "still logged in
 * after logging out" report.
 */
let sessionGeneration = 0;

export function currentSessionGeneration() {
  return sessionGeneration;
}

export function clearTokens() {
  // Invalidate first, so anything awaiting mid-flight is already stale by
  // the time it resolves, even if removal itself were to throw.
  sessionGeneration += 1;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  // Drop queued replays and release the refresh lock — a queued request
  // resuming after logout would re-authenticate as the previous person.
  pendingQueue = [];
  isRefreshing = false;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = getRefreshToken();
      if (!refresh) {
        clearTokens();
        window.location.href = '/admin/login';
        return Promise.reject(error);
      }
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingQueue.push(() => resolve(api(original)));
        });
      }
      isRefreshing = true;
      // Captured BEFORE the await: if a logout happens while this request is
      // in flight, the generation moves on and the result below is discarded.
      const generationAtRefresh = sessionGeneration;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
        if (generationAtRefresh !== sessionGeneration) {
          // Logged out mid-refresh. Writing these tokens would resurrect the
          // previous person's session on a shared machine.
          return Promise.reject(error);
        }
        setTokens(data.access, refresh);
        pendingQueue.forEach((cb) => cb());
        pendingQueue = [];
        return api(original);
      } catch (refreshError) {
        clearTokens();
        window.location.href = '/admin/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// -- auth (shared OTP mechanism with the User Portal; permission checks
// on the backend are what actually gate access to admin endpoints) -----
export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) => api.post('/auth/verify-otp/', { phone_number, otp }),
  me: () => api.get('/auth/me/'),
};

// -- admin endpoints ------------------------------------------------------
export const adminApi = {
  dashboardSummary: () => api.get('/admin/dashboard/summary/'),

  documents: (status?: string) => api.get('/admin/documents/', { params: { status } }),
  approveDocument: (id: string, structured_data: Record<string, unknown>) =>
    api.patch(`/admin/documents/${id}/`, { structured_data }),

  policies: (status?: string) => api.get('/admin/insurance-policies/', { params: { status } }),
  validatePolicy: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/insurance-policies/${id}/`, data),

  doctorVerification: () => api.get('/admin/doctor-verification/'),
  approveDoctor: (id: string) => api.post(`/admin/doctor-verification/${id}/approve/`),
  rejectDoctor: (id: string) => api.post(`/admin/doctor-verification/${id}/reject/`),

  // Patient PROFILES (family members), distinct from accounts() below which
  // lists login records. Staff-only directory endpoint.
  patients: (search?: string) => api.get('/admin/patients/', { params: { search } }),

  accounts: (search?: string) => api.get('/admin/accounts/', { params: { search } }),
  deactivateAccount: (id: string) => api.post(`/admin/accounts/${id}/deactivate/`),

  auditLog: () => api.get('/admin/audit-log/'),
};
