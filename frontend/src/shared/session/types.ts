/** What the backend's /auth/me/ returns (accounts/serializers.py). */
export type Account = {
  id: string;
  phone_number: string;
  email: string | null;
  role: 'patient' | 'doctor' | 'admin' | 'ocr_reviewer' | 'claims_ops';
  date_joined: string;
};

export const STAFF_ROLES: Account['role'][] = ['admin', 'ocr_reviewer', 'claims_ops'];

export type Profile = {
  id: string;
  full_name: string;
  relation: string;
  blood_group?: string;
  /** Short shareable patient code, e.g. "AB1234". Server-generated. */
  reference_code?: string;
  date_of_birth?: string | null;
  gender?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  preferred_language?: string;
  initials: string;
};

/** The signed-in account's own Doctor record (/doctors/me/). */
export type DoctorRecord = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  verification_status: 'pending' | 'manual_review' | 'failed' | 'verified' | 'rejected';
  clinic_name: string;
  clinic_address?: string;
  registration_number?: string;
  state_council_id?: string;
  state_council_name?: string;
  registration_year?: number | null;
  /** Set by an admin when rejecting; shown so the doctor can correct it. */
  rejection_reason?: string;
  nmc_result?: '' | 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  nmc_name?: string;
  nmc_qualification?: string;
  booking_phone_number?: string;
  consultation_fee?: string | null;
  license_document?: string | null;
  available_days?: string[] | null;
  clinic_open_time?: string | null;
  clinic_close_time?: string | null;
};
