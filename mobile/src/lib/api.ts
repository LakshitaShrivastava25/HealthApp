import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { getApiBaseUrl } from './config';
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from './tokens';

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const api: AxiosInstance = axios.create();

/**
 * Resolved per request rather than baked in at module load. The base URL can
 * change at runtime (the login screen's manual override), and an axios
 * instance created once at import time would have captured the old value.
 */
api.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl();
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Called when the session is truly gone, so the navigation layer can send
 * the person to the login screen. A callback rather than a direct
 * navigation call: this module must not depend on the router, or every
 * import of this file would drag routing in with it.
 */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * One refresh at a time, shared by every request that got a 401 while it
 * was running.
 *
 * The web app's version pushes callbacks onto a queue that is only drained
 * on success — if the refresh fails, every queued request stays pending
 * forever and the screens that made them hang on a spinner. Returning a
 * single shared promise instead means failure propagates to every waiter,
 * which is the whole point of waiting on it.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = await getRefreshToken();
    if (!refresh) return null;
    try {
      const { data } = await axios.post(`${getApiBaseUrl()}/auth/refresh/`, { refresh });
      await setAccessToken(data.access);
      return data.access as string;
    } catch {
      return null;
    } finally {
      // Cleared inside the same promise so the next 401 starts a fresh
      // attempt rather than re-awaiting this settled one.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    const access = await refreshAccessToken();
    if (!access) {
      await clearTokens();
      onSessionExpired?.();
      return Promise.reject(error);
    }
    return api(original);
  }
);

/** DRF pagination returns a results array; some views return a bare list. */
export function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const results = (data as { results?: T[] } | null)?.results;
  return results ?? [];
}

/**
 * A file chosen from the camera roll or the document picker, in the shape
 * React Native's FormData needs. RN cannot construct a browser File, so
 * this triple is the platform's equivalent and is what every upload below
 * expects.
 */
export type UploadFile = { uri: string; name: string; type: string };

function fileForm(file: UploadFile, fields: Record<string, string>) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  // The cast is unavoidable: RN's FormData accepts this object at runtime,
  // but the DOM lib's type for append() only admits Blob or string.
  form.append('file', file as unknown as Blob);
  return form;
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// -- auth ----------------------------------------------------------------
export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) =>
    api.post('/auth/verify-otp/', { phone_number, otp }),
  me: () => api.get('/auth/me/'),
  deleteAccount: () => api.delete('/auth/me/'),
};

// -- patient -------------------------------------------------------------
export const profilesApi = {
  list: () => api.get('/profiles/'),
  get: (id: string) => api.get(`/profiles/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/profiles/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/profiles/${id}/`, data),
  ask: (profileId: string, question: string) =>
    api.post(`/profiles/${profileId}/ask/`, { question }),
};

export const documentsApi = {
  list: (profileId: string, category?: string) =>
    api.get('/documents/', { params: { profile_id: profileId, category: category || undefined } }),
  get: (id: string) => api.get(`/documents/${id}/`),
  upload: (profileId: string, file: UploadFile, category: string) =>
    api.post(
      '/documents/',
      fileForm(file, { profile: profileId, category, title: file.name }),
      MULTIPART
    ),
  correct: (id: string, structured_data: Record<string, unknown>) =>
    api.patch(`/documents/${id}/correct/`, { structured_data }),
  delete: (id: string) => api.delete(`/documents/${id}/`),
};

export const timelineApi = {
  list: (profileId: string) => api.get('/timeline/', { params: { profile_id: profileId } }),
};

export const insuranceApi = {
  list: (profileId: string) => api.get('/insurance/', { params: { profile_id: profileId } }),
  upload: (profileId: string, file: UploadFile) =>
    api.post('/insurance/', fileForm(file, { profile: profileId }), MULTIPART),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/insurance/${id}/`, data),
  confirm: (id: string) => api.post(`/insurance/${id}/confirm/`),
  delete: (id: string) => api.delete(`/insurance/${id}/`),
  chatHistory: (policyId: string) => api.get(`/insurance/${policyId}/chat/`),
  chat: (policyId: string, question: string) =>
    api.post(`/insurance/${policyId}/chat/`, { question }),
  estimate: (policyId: string, claim_category: string, estimated_bill: string) =>
    api.post(`/insurance/${policyId}/estimate/`, { claim_category, estimated_bill }),
};

export const medicinesApi = {
  list: (profileId: string) => api.get('/medications/', { params: { profile_id: profileId } }),
  create: (data: Record<string, unknown>) => api.post('/medications/', data),
  delete: (id: string) => api.delete(`/medications/${id}/`),
  addReminder: (medication: string, time_of_day: string) =>
    api.post('/reminders/', { medication, time_of_day }),
  logDose: (reminder: string, status: 'taken' | 'skipped', scheduled_for: string) =>
    api.post('/dose-logs/', { reminder, status, scheduled_for }),
  listDoseLogs: (profileId: string) =>
    api.get('/dose-logs/', { params: { profile_id: profileId } }),
};

export const allergiesApi = {
  list: (profileId: string) => api.get('/allergies/', { params: { profile_id: profileId } }),
  create: (data: Record<string, unknown>) => api.post('/allergies/', data),
  delete: (id: string) => api.delete(`/allergies/${id}/`),
};

export const notificationsApi = {
  list: (profileId: string) => api.get('/notifications/', { params: { profile_id: profileId } }),
  markRead: (id: string) => api.post(`/notifications/${id}/mark_read/`),
};

export const emergencyApi = {
  list: () => api.get('/emergency-qr/'),
  create: (profile: string, emergency_contact_name: string, emergency_contact_phone: string) =>
    api.post('/emergency-qr/', { profile, emergency_contact_name, emergency_contact_phone }),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/emergency-qr/${id}/`, data),
  regenerate: (id: string) => api.post(`/emergency-qr/${id}/regenerate/`),
  revoke: (id: string) => api.post(`/emergency-qr/${id}/revoke/`),
};

export const doctorAccessApi = {
  listForProfile: (profileId: string) =>
    api.get('/doctor-access/', { params: { profile_id: profileId } }),
  approve: (id: string) => api.post(`/doctor-access/${id}/approve/`),
  deny: (id: string) => api.post(`/doctor-access/${id}/deny/`),
  revoke: (id: string) => api.post(`/doctor-access/${id}/revoke/`),
};

export const doctorsApi = {
  list: () => api.get('/doctors/'),
};

// -- doctor portal --------------------------------------------------------
export const doctorApi = {
  me: () => api.get('/doctors/me/'),
  register: (form: FormData) => api.post('/doctors/', form, MULTIPART),
  updateProfile: (form: FormData) => api.patch('/doctors/me/', form, MULTIPART),
  updateAvailability: (data: {
    available_days: string[];
    clinic_open_time: string | null;
    clinic_close_time: string | null;
  }) => api.patch('/doctors/availability/', data),
};

export const accessApi = {
  list: () => api.get('/doctor-access/'),
  request: (doctor: string, profile: string) => api.post('/doctor-access/', { doctor, profile }),
  revoke: (id: string) => api.post(`/doctor-access/${id}/revoke/`),
};

export const notesApi = {
  list: () => api.get('/consultation-notes/'),
  create: (data: Record<string, unknown>) => api.post('/consultation-notes/', data),
};

export const patientDataApi = {
  timeline: (profileId: string) => api.get('/timeline/', { params: { profile_id: profileId } }),
  documents: (profileId: string) => api.get('/documents/', { params: { profile_id: profileId } }),
  allergies: (profileId: string) => api.get('/allergies/', { params: { profile_id: profileId } }),
  medications: (profileId: string) =>
    api.get('/medications/', { params: { profile_id: profileId } }),
};

// -- admin portal ---------------------------------------------------------
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
  patients: (search?: string) => api.get('/admin/patients/', { params: { search } }),
  accounts: (search?: string) => api.get('/admin/accounts/', { params: { search } }),
  deactivateAccount: (id: string) => api.post(`/admin/accounts/${id}/deactivate/`),
  auditLog: () => api.get('/admin/audit-log/'),
};
