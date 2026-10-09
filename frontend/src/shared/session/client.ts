import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL } from '../apiConfig';
import { withRefreshLock } from '../refreshLock';

/**
 * The one signed-in session behind the website's User and Doctor modes.
 *
 * The mobile app has always been one login whose account can switch
 * between User and Doctor mode. The website used to be three portals with
 * three token stores, so a doctor signed in twice and a patient could not
 * become a doctor without a second login. Both modes now share these
 * tokens; only the staff Admin Portal keeps its own (src/admin/lib/api.ts).
 *
 * Each mode gets its own axios instance (createApiClient) so every request
 * tells the backend which side it acts for — `?acting_as=patient|doctor`,
 * see backend/doctors/access.py. The token store and the refresh routine
 * below are shared by both instances, so a refresh is never run twice and
 * a logout ends both modes at once.
 */

export type Mode = 'patient' | 'doctor';

export const LOGIN_PATH = '/login';

const ACCESS_KEY = 'healthnow_access_token';
const REFRESH_KEY = 'healthnow_refresh_token';
// Where the Doctor Portal kept its own session before the two modes shared
// one. Moved over once, so a doctor who was signed in stays signed in.
const LEGACY_DOCTOR_ACCESS_KEY = 'healthnow_doctor_access_token';
const LEGACY_DOCTOR_REFRESH_KEY = 'healthnow_doctor_refresh_token';

function migrateLegacyDoctorSession() {
  try {
    const access = localStorage.getItem(LEGACY_DOCTOR_ACCESS_KEY);
    const refresh = localStorage.getItem(LEGACY_DOCTOR_REFRESH_KEY);
    // A patient session already here wins: it is the one the person used
    // most recently on the page every sign-in now lands on.
    if (access && refresh && !localStorage.getItem(REFRESH_KEY)) {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    }
    localStorage.removeItem(LEGACY_DOCTOR_ACCESS_KEY);
    localStorage.removeItem(LEGACY_DOCTOR_REFRESH_KEY);
  } catch {
    // Storage blocked (private mode, policy): nothing to migrate.
  }
}
migrateLegacyDoctorSession();

// -- token storage -----------------------------------------------------
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
 * Bumped by clearTokens(). A refresh captures it before awaiting and
 * re-checks it afterwards, so a refresh that was in flight when someone
 * logged out can never write its tokens back into storage — that silently
 * restored the previous person's session on a shared machine.
 */
let sessionGeneration = 0;

export function currentSessionGeneration() {
  return sessionGeneration;
}

let refreshInFlight: Promise<boolean> | null = null;

export function clearTokens() {
  // Invalidate first, so anything awaiting mid-flight is already stale by
  // the time it resolves.
  sessionGeneration += 1;
  refreshInFlight = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/**
 * One refresh at a time for every request (and both modes) that hit a 401
 * while it ran — they all await this same promise, so a failure reaches
 * every waiter instead of leaving some queued forever.
 *
 * Resolves true when fresh tokens are in storage, false when the session
 * was ended meanwhile. Rejects when the refresh request itself failed; the
 * caller decides whether that ends the session.
 */
function refreshSession(sentWith: unknown): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const generation = sessionGeneration;
  const attempt: Promise<boolean> = withRefreshLock(REFRESH_KEY, async () => {
    // Logged out while waiting for the lock: any tokens in storage now
    // belong to whoever signed in next, not to this request.
    if (generation !== sessionGeneration) return false;
    // Another tab may have refreshed while this one waited for the lock;
    // its new tokens are in storage, and the refresh token this tab read is
    // now blacklisted. Reuse theirs instead.
    const stored = getAccessToken();
    if (stored && `Bearer ${stored}` !== sentWith) return true;
    const refresh = getRefreshToken();
    if (!refresh) return false;
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh });
    if (generation !== sessionGeneration) return false;
    // The backend rotates refresh tokens and blacklists the old one.
    setTokens(data.access, data.refresh);
    return true;
  }).finally(() => {
    // Only clear our own promise — a logout may already have replaced it.
    if (refreshInFlight === attempt) refreshInFlight = null;
  });
  refreshInFlight = attempt;
  return attempt;
}

/** The session is gone for good: clear it and go to the sign-in screen. */
function endSession() {
  clearTokens();
  if (window.location.pathname !== LOGIN_PATH) window.location.assign(LOGIN_PATH);
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** An API client whose every request acts in `mode`, sharing this session. */
export function createApiClient(mode: Mode): AxiosInstance {
  const client = axios.create({ baseURL: API_BASE_URL });

  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // A call may name its mode explicitly (the session reads the account's
    // own profiles in user mode even from a doctor screen), so it wins.
    config.params = { acting_as: mode, ...config.params };
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config as RetriableConfig | undefined;
      if (error.response?.status !== 401 || !original || original._retry) {
        return Promise.reject(error);
      }
      original._retry = true;
      if (!getRefreshToken()) {
        endSession();
        return Promise.reject(error);
      }

      const generation = sessionGeneration;
      let refreshed: boolean;
      try {
        refreshed = await refreshSession(original.headers?.Authorization);
      } catch (refreshError) {
        // Logged out mid-refresh: that logout already cleaned up, and doing
        // it again here could end the next person's session.
        if (generation !== sessionGeneration) return Promise.reject(error);
        // The server refused the refresh token: the session is over. No
        // response at all is a network problem — fail this request but
        // keep the person signed in for when the connection comes back.
        if (axios.isAxiosError(refreshError) && refreshError.response) endSession();
        return Promise.reject(error);
      }
      if (!refreshed) {
        if (generation === sessionGeneration) endSession();
        return Promise.reject(error);
      }
      return client(original);
    }
  );

  return client;
}
