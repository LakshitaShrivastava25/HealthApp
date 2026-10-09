import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';
import { withRefreshLock } from '../../shared/refreshLock';

const BASE_URL = API_BASE_URL;

export const api = axios.create({ baseURL: BASE_URL });

// Separate localStorage keys from the User Portal — an admin and a patient
// could plausibly be open in different tabs of the same browser profile,
// and these must never collide or overwrite each other.
const ACCESS_KEY = 'healthnow_admin_access_token';
const REFRESH_KEY = 'healthnow_admin_refresh_token';

// Shared by clearTokens() and the 401 interceptor below.
let isRefreshing = false;
// Requests that hit a 401 while a refresh was already running. Each one is
// settled exactly once — replayed when the refresh lands, rejected with its
// own 401 when it fails or the session ends — so no screen waits forever.
type QueuedRequest = { replay: () => void; fail: () => void };
let pendingQueue: QueuedRequest[] = [];

function settleQueue(refreshed: boolean) {
  // Swap before running: a replay that 401s again must not land in the
  // list being walked.
  const waiters = pendingQueue;
  pendingQueue = [];
  waiters.forEach((w) => (refreshed ? w.replay() : w.fail()));
}

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
  // Reject queued replays and release the refresh lock — a queued request
  // resuming after logout would re-authenticate as the previous person, and
  // one silently dropped would leave its caller waiting forever.
  settleQueue(false);
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
        window.location.href = '/login';
        return Promise.reject(error);
      }
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            replay: () => resolve(api(original)),
            fail: () => reject(error),
          });
        });
      }
      isRefreshing = true;
      // Captured BEFORE the await: if a logout happens while this request is
      // in flight, the generation moves on and the result below is discarded.
      const generationAtRefresh = sessionGeneration;
      const sentWith = original.headers?.Authorization;
      try {
        const refreshed = await withRefreshLock(REFRESH_KEY, async () => {
          // Logged out while waiting for the lock: any tokens in storage now
          // belong to whoever signed in next, not to this request.
          if (generationAtRefresh !== sessionGeneration) return false;
          // Another tab may have refreshed while this one waited for the
          // lock; its new tokens are in storage, and the refresh token read
          // above is now blacklisted. Reuse theirs instead.
          const stored = getAccessToken();
          if (stored && `Bearer ${stored}` !== sentWith) return true;
          const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh: getRefreshToken() });
          // Logged out mid-refresh. Writing these tokens would resurrect the
          // previous person's session on a shared machine.
          if (generationAtRefresh !== sessionGeneration) return false;
          // The old refresh token was just blacklisted — keep the rotated one.
          setTokens(data.access, data.refresh);
          return true;
        });
        // Logged out mid-refresh: clearTokens() has already rejected
        // everything queued behind this refresh. Settling the queue again
        // here could reject a newer session's waiters.
        if (!refreshed) return Promise.reject(error);
        settleQueue(true);
        return api(original);
      } catch (refreshError) {
        // Logged out mid-refresh (which can itself make the refresh fail):
        // that logout already cleaned up, and clearing again here could end
        // the next person's session.
        if (generationAtRefresh !== sessionGeneration) return Promise.reject(error);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        // After a logout clearTokens() already released the lock, and a newer
        // session's refresh may hold it by now.
        if (generationAtRefresh === sessionGeneration) isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// -- auth (staff sign in at /login, which hands the session to this store;
// permission checks on the backend are what actually gate admin endpoints) --
export const authApi = {
  me: () => api.get('/auth/me/'),
  // Blacklists the refresh token server-side. Plain axios: a 401 here must
  // not kick off a refresh of the session being ended.
  logout: (refresh: string) => axios.post(`${BASE_URL}/auth/logout/`, { refresh }),
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

  // status: 'review' (pending + under review + register unreachable), a
  // single status, or '' for everyone. Paginated, 20 a page.
  doctorQueue: (status: string, page = 1) =>
    api.get('/admin/doctors/', { params: { ...(status ? { status } : {}), page } }),
  approveDoctor: (id: string) => api.post(`/admin/doctor-verification/${id}/approve/`),
  // The reason is shown to the doctor so they can correct their details.
  rejectDoctor: (id: string, reason?: string) =>
    api.post(`/admin/doctor-verification/${id}/reject/`, reason ? { reason } : {}),
  // Asks the NMC register again; records what it says, decides nothing.
  reverifyDoctor: (id: string) => api.post(`/admin/doctors/${id}/reverify/`),

  // Patient PROFILES (family members), distinct from accounts() below which
  // lists login records. Staff-only directory endpoint.
  patients: (search?: string) => api.get('/admin/patients/', { params: { search } }),

  accounts: (search?: string) => api.get('/admin/accounts/', { params: { search } }),
  deactivateAccount: (id: string) => api.post(`/admin/accounts/${id}/deactivate/`),

  auditLog: () => api.get('/admin/audit-log/'),

  // Login OTP mode switch: 'master' (fixed code, no SMS) or 'sms' (2Factor).
  otpSettings: () => api.get('/admin/otp-settings/'),
  updateOtpSettings: (data: { mode?: 'sms' | 'master'; master_otp?: string }) =>
    api.patch('/admin/otp-settings/', data),
  sendTestSms: (test_phone: string) => api.post('/admin/otp-settings/', { test_phone }),
};
