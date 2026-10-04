/**
 * Turns an OTP request/verify failure into something a person can act on.
 *
 * The old screens collapsed every failure into one of two strings, which
 * meant a rate-limited user, an expired code and a deleted account all
 * read as "Invalid or expired OTP. Try again." — advice that is useless
 * in the first case and actively wrong in the third.
 *
 * The backend now tells these apart itself (accounts/views.py): a wrong
 * code, an expired one, spent attempts and an unreachable SMS gateway each
 * come back with their own status and `detail`. That wording is preferred
 * whenever it is present — it knows things the client cannot, such as
 * attempts carried over across a resend of the same code. The text below
 * is only the fallback for a response without one.
 */

export type AuthErrorContext = {
  /** How many codes this session has already had rejected. */
  rejectedAttempts?: number;
};

type MaybeAxiosError = {
  response?: { status?: number; data?: { detail?: unknown } };
  request?: unknown;
};

/** Matches the attempt cap in accounts/services.py (and Twilio Verify's). */
export const MAX_VERIFY_ATTEMPTS = 5;

/** The backend's own message, if it sent a usable one. */
function backendDetail(e: MaybeAxiosError): string | null {
  const detail = e?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : null;
}

export function describeSendOtpError(err: unknown): string {
  const e = err as MaybeAxiosError;
  const status = e?.response?.status;

  if (!e?.response) {
    return "Can't reach CuraPath right now. Check your connection and try again.";
  }
  if (status === 429) {
    // Either the 60-second resend cooldown (which also sends retry_after)
    // or the five-codes-an-hour cap. The detail says which and how long;
    // the resend timer itself already runs off useOtpTimers' own 60s.
    return (
      backendDetail(e) ??
      'Too many codes requested for this number. For security, please wait an hour before trying again.'
    );
  }
  if (status === 400) {
    return backendDetail(e) ?? "That doesn't look like a valid phone number. Check it and try again.";
  }
  if (status === 502) {
    // The SMS gateway refused or couldn't be reached.
    return backendDetail(e) ?? "Couldn't send the OTP SMS. Please try again.";
  }
  return 'Something went wrong sending your code. Please try again in a moment.';
}

export function describeVerifyOtpError(err: unknown, ctx: AuthErrorContext = {}): string {
  const e = err as MaybeAxiosError;
  const status = e?.response?.status;

  if (!e?.response) {
    return "Can't reach CuraPath right now. Check your connection and try again.";
  }
  if (status === 403) {
    // e.g. "This account has been deleted. Contact support if this was a
    // mistake." — the backend's own wording is the right thing to show.
    return backendDetail(e) ?? 'This account cannot sign in. Please contact support.';
  }
  if (status === 429) {
    return backendDetail(e) ?? 'Too many wrong attempts. Tap Resend to get a new code.';
  }
  if (status === 502) {
    // The code could not be checked at all — it was not judged wrong, and
    // the backend did not count it as an attempt.
    return backendDetail(e) ?? "Couldn't check the code right now. Please try again.";
  }
  if (status === 400) {
    const detail = backendDetail(e);
    if (detail) return detail;
    if ((ctx.rejectedAttempts ?? 0) + 1 >= MAX_VERIFY_ATTEMPTS) {
      return 'Too many incorrect attempts. This code is no longer valid — request a new one.';
    }
    const left = MAX_VERIFY_ATTEMPTS - ((ctx.rejectedAttempts ?? 0) + 1);
    return `That code isn't right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before you'll need a new one.`;
  }
  return 'Something went wrong signing you in. Please try again in a moment.';
}

/**
 * Whether a verify failure used up one of the code's attempts — i.e. the
 * backend actually judged the code. A 502 (couldn't check), a dropped
 * connection or a 403 (deleted account) must not count towards the cap.
 */
export function consumedVerifyAttempt(err: unknown): boolean {
  return (err as MaybeAxiosError)?.response?.status === 400;
}
