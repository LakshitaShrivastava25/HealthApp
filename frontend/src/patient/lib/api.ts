import axios from 'axios';

import { API_BASE_URL } from '../../shared/apiConfig';
import { userApi } from '../../shared/session/clients';

/**
 * User-mode API. Tokens, refresh and the session itself live in
 * shared/session (one sign-in for User and Doctor mode); this client adds
 * `acting_as=patient` to every request, so a doctor account working in User
 * mode reads and writes its own family's records, never a patient's.
 */
export const api = userApi;

export {
  clearTokens,
  currentSessionGeneration,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '../../shared/session/client';

// -- typed endpoint helpers ----------------------------------------------
export const authApi = {
  sendOtp: (phone_number: string) => api.post('/auth/send-otp/', { phone_number }),
  verifyOtp: (phone_number: string, otp: string) => api.post('/auth/verify-otp/', { phone_number, otp }),
  me: () => api.get('/auth/me/'),
  deleteAccount: () => api.delete('/auth/me/'),
  // Blacklists the refresh token server-side. Plain axios: a 401 here must
  // not kick off a refresh of the session being ended.
  logout: (refresh: string) => axios.post(`${API_BASE_URL}/auth/logout/`, { refresh }),
};

export const profilesApi = {
  list: () => api.get('/profiles/'),
  // The full writable field set from ProfileSerializer — the add-family-member
  // form collects the same details the profile view shows, so a member added
  // here is not a second-class record missing half its data.
  create: (data: {
    full_name: string;
    relation: string;
    blood_group?: string;
    date_of_birth?: string;
    gender?: string;
    height_cm?: number;
    weight_kg?: number;
    preferred_language?: string;
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
  // The person confirms this is a copy of another document (kept, but it
  // adds nothing to the timeline or medicines), or that it is not.
  markDuplicate: (id: string, ofId: string) => api.post(`/documents/${id}/mark-duplicate/`, { of: ofId }),
  notDuplicate: (id: string) => api.post(`/documents/${id}/not-duplicate/`),
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
  // One row per medicine across every prescription. scope: 'current'
  // (default — what the person is meant to be taking), 'past' or 'all'.
  list: (profileId: string, scope: 'current' | 'past' | 'all' = 'current') =>
    api.get('/medications/', { params: { profile_id: profileId, scope } }),
  // The person's own answer to "still taking it?" — wins until a newer prescription.
  setStatus: (id: string, status: 'taking' | 'stopped') =>
    api.post(`/medications/${id}/set-status/`, { status }),
  merge: (id: string, otherId: string) => api.post(`/medications/${id}/merge/`, { other: otherId }),
  keepSeparate: (id: string, otherId: string) => api.post(`/medications/${id}/keep-separate/`, { other: otherId }),
  unmerge: (id: string) => api.post(`/medications/${id}/unmerge/`),
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
  create: (data: { profile: string; kind: string; substance: string; reaction?: string }) =>
    api.post('/allergies/', data),
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
