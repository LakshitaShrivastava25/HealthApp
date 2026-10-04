import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';
import { withRefreshLock } from '../../shared/refreshLock';

const BASE_URL = API_BASE_URL;

export const api = axios.create({ baseURL: BASE_URL });

const ACCESS_KEY = 'healthnow_doctor_access_token';
const REFRESH_KEY = 'healthnow_doctor_refresh_token';

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
        window.location.href = '/doctor/login';
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
        window.location.href = '/doctor/login';
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

export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) => api.post('/auth/verify-otp/', { phone_number, otp }),
  // The caller's OWN account, for showing their login number read-only on the
  // profile page. Deliberately not folded into DoctorSerializer: that one is
  // patient-facing, and the login number must never reach Find Care.
  me: () => api.get('/auth/me/'),
  // Blacklists the refresh token server-side. Plain axios: a 401 here must
  // not kick off a refresh of the session being ended.
  logout: (refresh: string) => axios.post(`${BASE_URL}/auth/logout/`, { refresh }),
};

export const doctorApi = {
  me: () => api.get('/doctors/me/'),
  // Sent as multipart/form-data — same pattern the User Portal already uses
  // for insurance/document uploads — because registration can now carry a
  // license document. Optional fields are omitted rather than sent blank:
  // an empty string would fail DecimalField/FileField parsing server-side.
  register: (data: {
    full_name: string;
    specialization: string;
    qualification: string;
    experience_years: number;
    clinic_name: string;
    registration_number: string;
    clinic_address: string;
    booking_phone_number: string;
    consultation_fee?: string;
    license_document?: File | null;
  }) => {
    const form = new FormData();
    form.append('full_name', data.full_name);
    form.append('specialization', data.specialization);
    form.append('qualification', data.qualification);
    form.append('experience_years', String(data.experience_years));
    form.append('clinic_name', data.clinic_name);
    form.append('registration_number', data.registration_number);
    form.append('clinic_address', data.clinic_address);
    form.append('booking_phone_number', data.booking_phone_number);
    if (data.consultation_fee) form.append('consultation_fee', data.consultation_fee);
    if (data.license_document) form.append('license_document', data.license_document);
    return api.post('/doctors/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const profileApi = {
  // PATCH /api/doctors/me/ — no id in the URL, so the backend resolves the
  // record from the caller's own token. Multipart because the form can carry
  // a licence document, matching the registration upload pattern.
  update: (form: FormData) =>
    api.patch('/doctors/me/', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const availabilityApi = {
  // PATCH /api/doctors/availability/ — no id in the URL: the backend resolves
  // the record from the caller's own token, so this can only ever write the
  // logged-in doctor's own availability.
  update: (data: {
    available_days: string[];
    clinic_open_time: string | null;
    clinic_close_time: string | null;
  }) => api.patch('/doctors/availability/', data),
};

export const accessApi = {
  list: () => api.get('/doctor-access/'),
  request: (doctorId: string, profileReferenceId: string) =>
    api.post('/doctor-access/', { doctor: doctorId, profile: profileReferenceId }),
  revoke: (id: string) => api.post(`/doctor-access/${id}/revoke/`),
};

export const notesApi = {
  list: () => api.get('/consultation-notes/'),
  create: (data: { profile: string; diagnosis: string; prescription: string; notes: string; follow_up_date?: string }) =>
    api.post('/consultation-notes/', data),
};

// Read-only views into a consenting patient's own records — same endpoints
// the User Portal uses; access is enforced server-side by the presence of
// an APPROVED DoctorPatientAccess grant, not by anything client-side.
export const patientDataApi = {
  timeline: (profileId: string) => api.get('/timeline/', { params: { profile_id: profileId } }),
  documents: (profileId: string) => api.get('/documents/', { params: { profile_id: profileId } }),
  allergies: (profileId: string) => api.get('/allergies/', { params: { profile_id: profileId } }),
  // Same endpoint the patient uses; the backend swaps in a narrower
  // serializer for doctors (active meds only, no personal reminder times)
  // and scopes it to profiles with an APPROVED access grant.
  medications: (profileId: string) => api.get('/medications/', { params: { profile_id: profileId } }),
};
