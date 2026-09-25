import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';

const BASE_URL = API_BASE_URL;

export const api = axios.create({ baseURL: BASE_URL });

// Shared by clearTokens() and the 401 interceptor below.
let isRefreshing = false;
let pendingQueue: (() => void)[] = [];

// -- token storage -----------------------------------------------------
const ACCESS_KEY = 'healthnow_access_token';
const REFRESH_KEY = 'healthnow_refresh_token';

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

// -- attach JWT to every request ----------------------------------------
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// -- refresh once on 401, then give up and force logout -----------------
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = getRefreshToken();
      if (!refresh) {
        clearTokens();
        window.location.href = '/patient/login';
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
        window.location.href = '/patient/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// -- typed endpoint helpers ----------------------------------------------
export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) => api.post('/auth/verify-otp/', { phone_number, otp }),
  me: () => api.get('/auth/me/'),
  deleteAccount: () => api.delete('/auth/me/'),
};

export const profilesApi = {
  list: () => api.get('/profiles/'),
  create: (data: {
    full_name: string;
    relation: string;
    blood_group?: string;
    date_of_birth?: string;
    gender?: string;
  }) => api.post('/profiles/', data),
  update: (
    id: string,
    data: Partial<{
      full_name: string;
      date_of_birth: string;
      gender: string;
      blood_group: string;
      height_cm: number;
      weight_kg: number;
      preferred_language: string;
    }>
  ) => api.patch(`/profiles/${id}/`, data),
  ask: (profileId: string, question: string) => api.post(`/profiles/${profileId}/ask/`, { question }),
};

export const documentsApi = {
  list: (profileId: string, category?: string) =>
    api.get('/documents/', { params: { profile_id: profileId, category } }),
  get: (id: string) => api.get(`/documents/${id}/`),
  upload: (profileId: string, file: File, category: string) => {
    const form = new FormData();
    form.append('profile', profileId);
    form.append('file', file);
    form.append('category', category);
    form.append('title', file.name);
    return api.post('/documents/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  // Re-runs the AI pipeline on a document whose processing failed. The
  // file is already stored, so a retry costs only the call.
  retryProcessing: (id: string) => api.post(`/documents/${id}/retry-processing/`),
  // Review-screen edits. Mirrors insuranceApi.update + insuranceApi.confirm:
  // the edits are an ordinary PATCH, and confirm is a separate explicit step.
  update: (id: string, data: Partial<{
    title: string; category: string; document_date: string | null;
    hospital_name: string; doctor_name: string;
  }>) => api.patch(`/documents/${id}/`, data),
  confirm: (id: string) => api.post(`/documents/${id}/confirm/`),
  correct: (id: string, structuredData: Record<string, unknown>) =>
    api.patch(`/documents/${id}/correct/`, { structured_data: structuredData }),
  delete: (id: string) => api.delete(`/documents/${id}/`),
};

export const doctorAccessApi = {
  listForProfile: (profileId: string) => api.get('/doctor-access/', { params: { profile_id: profileId } }),
  approve: (id: string) => api.post(`/doctor-access/${id}/approve/`),
  deny: (id: string) => api.post(`/doctor-access/${id}/deny/`),
  revoke: (id: string) => api.post(`/doctor-access/${id}/revoke/`),
};

export const timelineApi = {
  list: (profileId: string) => api.get('/timeline/', { params: { profile_id: profileId } }),
};

export const insuranceApi = {
  list: (profileId: string) => api.get('/insurance/', { params: { profile_id: profileId } }),
  upload: (profileId: string, file: File) => {
    const form = new FormData();
    form.append('profile', profileId);
    form.append('file', file);
    return api.post('/insurance/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  chat: (policyId: string, question: string) => api.post(`/insurance/${policyId}/chat/`, { question }),
  chatHistory: (policyId: string) => api.get(`/insurance/${policyId}/chat/`),
  estimate: (policyId: string, claim_category: string, estimated_bill: string) =>
    api.post(`/insurance/${policyId}/estimate/`, { claim_category, estimated_bill }),
  confirm: (id: string) => api.post(`/insurance/${id}/confirm/`),
  update: (id: string, data: Partial<{
    insurer: string; policy_number: string; plan_name: string; policy_type: string;
    sum_insured: string; coverage_start: string; coverage_end: string;
    room_rent_limit: string; co_payment_percent: string;
    premium_amount: string; premium_due_date: string;
  }>) => api.patch(`/insurance/${id}/`, data),
  delete: (id: string) => api.delete(`/insurance/${id}/`),
};

export const medicinesApi = {
  list: (profileId: string) => api.get('/medications/', { params: { profile_id: profileId } }),
  create: (data: { profile: string; name: string; dosage: string; instructions: string; frequency: string }) =>
    api.post('/medications/', data),
  delete: (id: string) => api.delete(`/medications/${id}/`),
  addReminder: (medicationId: string, time_of_day: string) =>
    api.post('/reminders/', { medication: medicationId, time_of_day }),
  logDose: (reminderId: string, status: 'taken' | 'skipped', scheduledFor: string) =>
    api.post('/dose-logs/', { reminder: reminderId, status, scheduled_for: scheduledFor }),
  listDoseLogs: (profileId: string) => api.get('/dose-logs/', { params: { profile_id: profileId } }),
};

export const allergiesApi = {
  list: (profileId: string) => api.get('/allergies/', { params: { profile_id: profileId } }),
};

export const emergencyApi = {
  list: (profileId: string) => api.get('/emergency-qr/', { params: { profile_id: profileId } }),
  create: (profileId: string, contactName: string, contactPhone: string) =>
    api.post('/emergency-qr/', {
      profile: profileId,
      emergency_contact_name: contactName,
      emergency_contact_phone: contactPhone,
    }),
  update: (
    id: string,
    data: Partial<{
      include_blood_group: boolean;
      include_allergies: boolean;
      include_medications: boolean;
      include_conditions: boolean;
      include_emergency_contact: boolean;
      include_insurance_summary: boolean;
    }>
  ) => api.patch(`/emergency-qr/${id}/`, data),
  regenerate: (id: string) => api.post(`/emergency-qr/${id}/regenerate/`),
  revoke: (id: string) => api.post(`/emergency-qr/${id}/revoke/`),
};

export const doctorsApi = {
  list: () => api.get('/doctors/'),
};
