import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';

const BASE_URL = API_BASE_URL;

export const api = axios.create({ baseURL: BASE_URL });

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
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
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
let isRefreshing = false;
let pendingQueue: (() => void)[] = [];

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
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
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
