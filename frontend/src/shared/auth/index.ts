/**
 * The shared auth UI, used by all three HealthNow portals.
 *
 * Everything a login/registration screen needs is re-exported from here
 * so a page imports one path instead of a dozen, and so moving a file
 * inside this folder never touches a portal.
 */
export { default as AuthShell } from './AuthShell';
export { default as AuthCard } from './AuthCard';
export { default as HealthNowLogo } from './HealthNowLogo';
export type { Portal } from './HealthNowLogo';
export { default as Step, StepHeading } from './Step';
export { default as Field } from './Field';
export { default as PhoneField } from './PhoneField';
export { default as OTPInput } from './OTPInput';
export { default as PrimaryButton } from './PrimaryButton';
export type { ButtonState } from './PrimaryButton';
export { default as SecurityBadge } from './SecurityBadge';
export { default as DevOtpChip } from './DevOtpChip';
export { default as SuccessOverlay } from './SuccessOverlay';
export { default as FormError } from './FormError';
export { default as AnimatedMedicalBackground } from './AnimatedMedicalBackground';
// AnimatedMedicalBackground's ambient loops are plain CSS animations, so any
// page using it outside <AuthShell> has to inject these keyframes too.
export { default as AuthKeyframes } from './AuthKeyframes';

export { describeSendOtpError, describeVerifyOtpError, MAX_VERIFY_ATTEMPTS } from './authErrors';
export { useOtpTimers, formatMmSs, OTP_TTL_SECONDS, MAX_SENDS_PER_HOUR } from './useOtpTimers';
export { useReducedMotion } from './useReducedMotion';
export { C, EASE_OUT, EASE_IN_OUT } from './tokens';
