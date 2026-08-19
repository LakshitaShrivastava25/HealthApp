import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const api = axios.create({ baseURL: BASE_URL });

// Separate localStorage keys from the User Portal — an admin and a patient
// could plausibly be open in different tabs of the same browser profile,
// and these must never collide or overwrite each other.
const ACCESS_KEY = 'healthnow_admin_access_token';
const REFRESH_KEY = 'healthnow_admin_refresh_token';

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

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
        window.location.href = '/login';
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
        window.location.href = '/login';
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

  accounts: (search?: string) => api.get('/admin/accounts/', { params: { search } }),
  deactivateAccount: (id: string) => api.post(`/admin/accounts/${id}/deactivate/`),

  auditLog: () => api.get('/admin/audit-log/'),
};
