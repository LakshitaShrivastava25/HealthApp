import { doctorModeApi } from '../../shared/session/clients';

/**
 * Doctor-mode API. Same signed-in session as User mode (shared/session);
 * this client adds `acting_as=doctor` to every request, so the backend
 * answers with approved patients' records, read-only.
 */
export const api = doctorModeApi;

export const authApi = {
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
    state_council_id: string;
    registration_year: string;
    /** The "I consent to CuraPath verifying my registration…" box. Required
     *  by the backend from every form that sends it. */
    verification_consent: boolean;
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
    form.append('state_council_id', data.state_council_id);
    form.append('registration_year', data.registration_year);
    form.append('verification_consent', String(data.verification_consent));
    form.append('clinic_address', data.clinic_address);
    form.append('booking_phone_number', data.booking_phone_number);
    if (data.consultation_fee) form.append('consultation_fee', data.consultation_fee);
    if (data.license_document) form.append('license_document', data.license_document);
    return api.post('/doctors/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  // The form's "Verify" button: looks the number up on the NMC register
  // before submitting. Informational — an admin reviews every registration.
  verifyRegistration: (data: {
    registration_number: string;
    state_council_id: string;
    registration_year?: number | null;
    full_name?: string;
  }) => api.post<RegisterCheck>('/doctors/verify-registration/', data),
};

export type RegisterCheck = {
  status: 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  nmc_name: string | null;
  nmc_qualification: string | null;
  nmc_university: string | null;
  name_match_score: number | null;
  name_matches: boolean | null;
  suspended: boolean;
  message: string;
  /** On a match: what the register holds, for the form to fill in. */
  prefill?: RegisterPrefill | null;
  /** Not found: other councils listing the same number (usually the wrong council was picked). */
  other_councils?: { state_council_id: string; state_council_name: string; year: number | null }[];
};

export type RegisterPrefill = {
  full_name?: string;
  qualification?: string;
  registration_year?: number;
  /** Years since registration — an estimate. */
  experience_years?: number;
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
