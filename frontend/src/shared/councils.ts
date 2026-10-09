/**
 * Medical councils, keyed by the code the NMC Indian Medical Register uses.
 * Mirrors backend/doctors/councils.py — the backend validates against that
 * list, so a change there must be copied here (and to mobile/src/lib/councils.ts).
 */
export const COUNCILS: { code: string; name: string }[] = [
  { code: 'AND', name: 'Andhra Pradesh Medical Council' },
  { code: 'ARU', name: 'Arunachal Pradesh Medical Council' },
  { code: 'ASS', name: 'Assam Medical Council' },
  { code: 'BIH', name: 'Bihar Medical Council' },
  { code: 'CHA', name: 'Chhattisgarh Medical Council' },
  { code: 'DEL', name: 'Delhi Medical Council' },
  { code: 'GOA', name: 'Goa Medical Council' },
  { code: 'GUJ', name: 'Gujarat Medical Council' },
  { code: 'HAR', name: 'Haryana Medical Council' },
  { code: 'HIM', name: 'Himachal Pradesh Medical Council' },
  { code: 'JAM', name: 'Jammu & Kashmir Medical Council' },
  { code: 'JHA', name: 'Jharkhand Medical Council' },
  { code: 'KAR', name: 'Karnataka Medical Council' },
  { code: 'MAD', name: 'Madhya Pradesh Medical Council' },
  { code: 'MAH', name: 'Maharashtra Medical Council' },
  { code: 'MAN', name: 'Manipur Medical Council' },
  { code: 'MCI', name: 'Medical Council of India' },
  { code: 'MIZ', name: 'Mizoram Medical Council' },
  { code: 'NAG', name: 'Nagaland Medical Council' },
  { code: 'ORI', name: 'Orissa Council of Medical Registration' },
  { code: 'PUN', name: 'Punjab Medical Council' },
  { code: 'RAJ', name: 'Rajasthan Medical Council' },
  { code: 'SIK', name: 'Sikkim Medical Council' },
  { code: 'TAM', name: 'Tamil Nadu Medical Council' },
  { code: 'TEL', name: 'Telangana State Medical Council' },
  { code: 'TC', name: 'Travancore Cochin Medical Council, Trivandrum' },
  { code: 'TRI', name: 'Tripura State Medical Council' },
  { code: 'UP', name: 'Uttar Pradesh Medical Council' },
  { code: 'UTT', name: 'Uttarakhand Medical Council' },
  { code: 'WES', name: 'West Bengal Medical Council' },
];

export function councilName(code: string | null | undefined) {
  return COUNCILS.find((c) => c.code === code)?.name ?? '';
}

/** The verification states a doctor can be in, as the doctor sees them. */
export const DOCTOR_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  manual_review: 'Under review',
  failed: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const DOCTOR_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  manual_review: 'warning',
  failed: 'warning',
  verified: 'success',
  rejected: 'danger',
};
