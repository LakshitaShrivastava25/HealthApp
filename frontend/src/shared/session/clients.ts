import { createApiClient } from './client';

/** Requests made from User-mode screens: the account's own family records. */
export const userApi = createApiClient('patient');

/** Requests made from Doctor-mode screens: approved patients, read-only. */
export const doctorModeApi = createApiClient('doctor');
