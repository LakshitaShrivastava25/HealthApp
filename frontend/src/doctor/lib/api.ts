import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';

const BASE_URL = API_BASE_URL;

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
        window.location.href = '/doctor/login';
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
        window.location.href = '/doctor/login';
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
  // The caller's OWN account, for showing their login number read-only on the
  // profile page. Deliberately not folded into DoctorSerializer: that one is
  // patient-facing, and the login number must never reach Find Care.
  me: () => api.get('/auth/me/'),
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
};
