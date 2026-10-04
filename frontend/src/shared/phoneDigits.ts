/**
 * Turns whatever is now in a phone field into the national number to keep.
 *
 * Shared by PhoneField (auth cards) and PhoneInput so both behave the same,
 * and kept in step with mobile/src/components/PhoneInput.tsx.
 *
 * A paste or autofill (several characters at once, or anything with a "+")
 * usually carries the dial code and/or the domestic trunk "0", so those are
 * peeled off before capping — otherwise "+91 98765 43210" kept its "91" and
 * lost the last two real digits. A single keystroke is treated differently:
 * typing into an already-full number is ignored rather than allowed to push
 * the first digits out.
 */
export function normalisePhoneDigits(
  raw: string,
  previous: string,
  dialCode: string,
  maxLength: number
): string {
  let digits = raw.replace(/\D/g, '');
  const isPaste = raw.includes('+') || digits.length - previous.length > 1;

  if (isPaste) {
    // Zeros first, so the "00" international prefix ("0091 98765 43210")
    // exposes the dial code to the check below.
    digits = digits.replace(/^0+/, '');
    const dial = dialCode.replace(/\D/g, '');
    if (dial && digits.length > maxLength && digits.startsWith(dial)) {
      digits = digits.slice(dial.length);
    }
    digits = digits.replace(/^0+/, '');
  } else {
    digits = digits.replace(/^0+/, '');
    if (digits.length > maxLength) return previous;
  }

  return digits.slice(0, maxLength);
}
