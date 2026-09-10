import { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

const LENGTH = 6;

/**
 * Six-box one-time-code entry.
 *
 * Split boxes look better than one field, but only if they behave like
 * one field — so everything people actually do is handled here:
 *
 *  - typing advances; typing over a filled box replaces that digit
 *  - Backspace clears the current box, or steps back if it is empty
 *  - arrow keys and Home/End move without editing
 *  - pasting a whole code fills every box, wherever the paste lands
 *  - SMS autofill drops all six characters into one input; that arrives
 *    as a multi-character change and is distributed, not truncated
 *
 * The value is kept gapless (always `\d{0,6}`, never "12  56") by sending
 * focus back to the first empty box if someone clicks ahead of it. That
 * invariant is what lets the caller treat `value` as the code itself and
 * `value.length === 6` as "ready to submit", with no cleanup step.
 *
 * `autoComplete="one-time-code"` is on the first box only — that is the
 * hook iOS and Android use to offer the code from the SMS, and repeating
 * it across all six confuses the heuristic rather than reinforcing it.
 */
export default function OTPInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const firedFor = useRef<string | null>(null);
  const wasInvalid = useRef(false);
  const shake = useAnimationControls();

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // Fire once per completed code. Without the ref guard this would call
  // the caller's verify on every re-render while the code sits full.
  useEffect(() => {
    if (value.length === LENGTH) {
      if (firedFor.current !== value) {
        firedFor.current = value;
        onComplete?.(value);
      }
    } else {
      firedFor.current = null;
    }
  }, [value, onComplete]);

  // Shake on each new rejection. Driven by the false→true edge rather
  // than a remount, because remounting the inputs would steal focus from
  // whoever is mid-correction.
  useEffect(() => {
    if (invalid && !wasInvalid.current) {
      shake.start({ x: [0, -6, 6, -5, 5, 0], transition: { duration: 0.4 } });
    }
    wasInvalid.current = invalid;
  }, [invalid, shake]);

  function focusBox(i: number) {
    const el = refs.current[Math.max(0, Math.min(i, LENGTH - 1))];
    el?.focus();
    el?.select();
  }

  function writeAt(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) return;

    const chars = value.split('');
    for (let i = 0; i < cleaned.length && index + i < LENGTH; i++) {
      chars[index + i] = cleaned[i];
    }
    onChange(chars.slice(0, LENGTH).join(''));
    focusBox(index + cleaned.length);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (index < value.length) {
        // Remove this digit and pull the rest left, which keeps the value
        // gapless without silently discarding what came after it.
        const chars = value.split('');
        chars.splice(index, 1);
        onChange(chars.join(''));
        focusBox(index);
      } else if (value.length > 0) {
        onChange(value.slice(0, -1));
        focusBox(value.length - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(index - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(index + 1);
    }
    if (e.key === 'Home') {
      e.preventDefault();
      focusBox(0);
    }
    if (e.key === 'End') {
      e.preventDefault();
      focusBox(Math.min(value.length, LENGTH - 1));
    }
  }

  return (
    <motion.div
      animate={shake}
      role="group"
      aria-label="One-time code, 6 digits"
      className="flex items-center justify-between gap-1.5 sm:gap-2"
    >
      {Array.from({ length: LENGTH }, (_, i) => {
        const filled = i < value.length;
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i] ?? ''}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            aria-invalid={invalid || undefined}
            maxLength={LENGTH}
            onChange={(e) => writeAt(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => {
              e.preventDefault();
              writeAt(0, e.clipboardData.getData('text'));
            }}
            onFocus={(e) => {
              // Clicking box 5 while only two digits are entered would
              // otherwise open a gap; send them to the next real box.
              if (i > value.length) {
                focusBox(value.length);
                return;
              }
              e.target.select();
            }}
            className={`h-[52px] w-full min-w-0 rounded-xl border bg-white/70 text-center text-lg font-semibold text-ink-900 outline-none transition-all duration-200 focus:scale-[1.04] focus:bg-white focus:shadow-[0_0_0_4px_rgba(109,91,208,0.14)] disabled:cursor-not-allowed disabled:opacity-60 ${
              invalid
                ? 'border-danger focus:border-danger focus:shadow-[0_0_0_4px_rgba(239,68,68,0.14)]'
                : filled
                  ? 'border-brand-purple/45 bg-white'
                  : 'border-border focus:border-brand-purple'
            }`}
          />
        );
      })}
    </motion.div>
  );
}
