/**
 * Turns an OTP request/verify failure into something a person can act on.
 *
 * The old screens collapsed every failure into one of two strings, which
 * meant a rate-limited user, an expired code and a deleted account all
 * read as "Invalid or expired OTP. Try again." — advice that is useless
 * in the first case and actively wrong in the third.
 *
 * The backend cannot always tell these apart for us: accounts/services.py
 * returns the same 400 whether the code was wrong, had expired, or had
 * already burned its five attempts. So the caller passes what only the
 * client knows — whether its own expiry countdown has run out, and how
 * many codes have been rejected so far — and that fills the gap.
 */

export type AuthErrorContext = {
  /** The local 5-minute countdown has reached zero. */
  expired?: boolean;
  /** How many codes this session has already had rejected. */
  rejectedAttempts?: number;
};

type MaybeAxiosError = {
  response?: { status?: number; data?: { detail?: string } };
  request?: unknown;
};

/** Matches OTP_RATE_LIMIT_PER_HOUR / the attempt cap in accounts/services.py. */
export const MAX_VERIFY_ATTEMPTS = 5;

export function describeSendOtpError(err: unknown): string {
  const e = err as MaybeAxiosError;
  const status = e?.response?.status;

  if (!e?.response) {
    return "Can't reach HealthNow right now. Check your connection and try again.";
  }
  if (status === 429) {
    // The backend allows five codes per number per hour.
    return "Too many codes requested for this number. For security, please wait an hour before trying again.";
  }
  if (status === 400) {
    return e.response?.data?.detail ?? "That doesn't look like a valid phone number. Check it and try again.";
  }
  return 'Something went wrong sending your code. Please try again in a moment.';
}

export function describeVerifyOtpError(err: unknown, ctx: AuthErrorContext = {}): string {
  const e = err as MaybeAxiosError;
  const status = e?.response?.status;

  if (!e?.response) {
    return "Can't reach HealthNow right now. Check your connection and try again.";
  }
  if (status === 403) {
    // e.g. "This account has been deleted. Contact support if this was a
    // mistake." — the backend's own wording is the right thing to show.
    return e.response?.data?.detail ?? 'This account cannot sign in. Please contact support.';
  }
  if (status === 400) {
    if (ctx.expired) {
      return 'That code has expired. Codes are valid for 5 minutes — request a new one.';
    }
    if ((ctx.rejectedAttempts ?? 0) + 1 >= MAX_VERIFY_ATTEMPTS) {
      return 'Too many incorrect attempts. This code is no longer valid — request a new one.';
    }
    const left = MAX_VERIFY_ATTEMPTS - ((ctx.rejectedAttempts ?? 0) + 1);
    return `That code isn't right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before you'll need a new one.`;
  }
  return 'Something went wrong signing you in. Please try again in a moment.';
}
