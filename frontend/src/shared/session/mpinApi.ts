import axios from 'axios';

import { API_BASE_URL } from '../apiConfig';
import { userApi } from './clients';
import type { Account } from './types';

/**
 * The PIN endpoints (backend/accounts/views.py, MPIN*View).
 *
 * unlock and grant go out on plain axios, like the token refresh: they are
 * the sign-in itself, and a wrong PIN answers 401 — through the shared
 * client that would start a session refresh and bounce to /login. The
 * authenticated calls use the normal client.
 */

const SIGN_IN_TIMEOUT_MS = 20000;

export type TokenResponse = { access: string; refresh: string; account?: Account; device_token?: string };
export type GrantResponse = TokenResponse & { grant: string; expires_in: number };

export const mpinApi = {
  /** A browser registered for PIN sign-in: its token and the PIN, no phone number. */
  unlock: (device_token: string, mpin: string) =>
    axios.post<TokenResponse>(
      `${API_BASE_URL}/auth/mpin/unlock/`,
      { device_token, mpin },
      { timeout: SIGN_IN_TIMEOUT_MS }
    ),

  /** Number + PIN on a browser that isn't registered; the server registers it on success. */
  unlockByPhone: (phone_number: string, mpin: string) =>
    axios.post<TokenResponse>(
      `${API_BASE_URL}/auth/mpin/unlock/`,
      { phone_number, mpin },
      { timeout: SIGN_IN_TIMEOUT_MS }
    ),

  /** SMS code -> a one-time grant to set a new PIN, plus a signed-in session. */
  grant: (phone_number: string, otp: string) =>
    axios.post<GrantResponse>(
      `${API_BASE_URL}/auth/mpin/grant/`,
      { phone_number, otp },
      { timeout: SIGN_IN_TIMEOUT_MS }
    ),

  set: (body: { mpin: string; otp_grant?: string; label?: string; platform?: string }) =>
    userApi.post<{ device_token: string }>('/auth/mpin/', body),

  enrollDevice: (body: { label?: string; platform?: string }) =>
    userApi.post<{ device_token: string }>('/auth/mpin/devices/', body),

  revokeDevice: (device_token: string) => userApi.delete('/auth/mpin/devices/', { data: { device_token } }),
};

/** The server's own wording for a refused PIN request, or the fallback. */
export function pinErrorMessage(err: unknown, fallback: string) {
  const detail = axios.isAxiosError(err) ? (err.response?.data as { detail?: unknown } | undefined)?.detail : undefined;
  if (typeof detail === 'string') return detail;
  if (axios.isAxiosError(err) && !err.response) return 'Could not reach CuraPath. Check your connection and try again.';
  return fallback;
}

/** True when the backend wants an SMS code before it will set a PIN. */
export function needsOtp(err: unknown) {
  return axios.isAxiosError(err) && !!(err.response?.data as { otp_required?: boolean } | undefined)?.otp_required;
}
