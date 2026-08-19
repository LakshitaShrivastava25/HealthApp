import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const api = axios.create({ baseURL: BASE_URL });

const ACCESS_KEY = 'healthnow_doctor_access_token';
const REFRESH_KEY = 'healthnow_doctor_refresh_token';

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

export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) => api.post('/auth/verify-otp/', { phone_number, otp }),
};

export const doctorApi = {
  me: () => api.get('/doctors/me/'),
  register: (data: {
    full_name: string;
    specialization: string;
    qualification: string;
    experience_years: number;
    clinic_name?: string;
  }) => api.post('/doctors/', data),
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
};
