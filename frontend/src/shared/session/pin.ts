/**
 * What PIN sign-in keeps in this browser — the website's version of the
 * mobile app's src/lib/pin.ts.
 *
 * The device token is half of the credential: the server only accepts a PIN
 * together with a token it issued to this browser after an SMS sign-in, so
 * a PIN alone can't be sprayed across accounts. It sits in localStorage like
 * the session tokens; anyone who lifts it still needs four digits the server
 * stops accepting after fifteen wrong tries.
 *
 * No biometric token here: a browser has no equivalent of the phone's
 * secure enclave to keep one behind.
 */

const MPIN_TOKEN_KEY = 'curapath_mpin_device_token';
const HINT_KEY = 'curapath_pin_hint';

/**
 * What the sign-in page may know before anyone has signed in: which account
 * this browser's PIN belongs to and the number to pre-fill. Nothing medical.
 */
export type PinHint = { accountId: string; phone: string };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, policy): PIN sign-in just isn't offered.
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to recover.
  }
}

export function getMpinToken() {
  return read(MPIN_TOKEN_KEY);
}

export function setMpinToken(token: string) {
  write(MPIN_TOKEN_KEY, token);
}

export function getPinHint(): PinHint | null {
  const raw = read(HINT_KEY);
  if (!raw) return null;
  try {
    const hint = JSON.parse(raw) as PinHint;
    return hint?.accountId && hint?.phone ? hint : null;
  } catch {
    return null;
  }
}

export function setPinHint(hint: PinHint) {
  write(HINT_KEY, JSON.stringify(hint));
}

/** Everything PIN sign-in holds. Called when the token dies or this browser is removed. */
export function clearPin() {
  remove(MPIN_TOKEN_KEY);
  remove(HINT_KEY);
}

/** "+919876543210" -> "+91 ••••• 43210". */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  const local = digits.slice(-10);
  const code = phone.startsWith('+') ? `+${digits.slice(0, digits.length - local.length)}` : '';
  return `${code ? `${code} ` : ''}••••• ${local.slice(-5)}`;
}

/** "Chrome on Windows" — how this browser is listed among the account's devices. */
export function browserLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return (os ? `${browser} on ${os}` : browser).slice(0, 80);
}
