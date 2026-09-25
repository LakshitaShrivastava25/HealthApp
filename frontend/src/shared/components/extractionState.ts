/**
 * Turns the backend's extraction metadata into something a patient should
 * actually read.
 *
 * The backend's own `note` is written for whoever runs the server: it names
 * environment variables (OCR_PROVIDER_API_KEY, ANTHROPIC_API_KEY) and
 * internal functions (extract_text_from_image). That is the right level of
 * detail for a log or the Django admin, and exactly the wrong thing to show
 * a person looking at their own medical record — so the note is deliberately
 * NOT passed through. These messages are written fresh instead.
 *
 * Display-only: nothing here changes what is stored or how extraction works.
 */

export type ExtractionMeta = {
  _extraction_failed?: boolean;
  _processing_failed?: boolean;
  _mock?: boolean;
  _extraction_warning?: string;
  note?: string;
};

export type ExtractionState =
  | { kind: 'failed'; message: string }
  | { kind: 'pending'; message: string }
  | { kind: 'warning'; message: string }
  | { kind: 'ok' };

/** Keys that are internal bookkeeping, never content to display. */
export const INTERNAL_KEYS = [
  '_extraction_failed',
  '_processing_failed',
  '_mock',
  '_extraction_warning',
  'note',
];

export function describeExtraction(data: unknown): ExtractionState {
  const sd = (data || {}) as ExtractionMeta;

  if (sd._extraction_failed || sd._processing_failed) {
    return {
      kind: 'failed',
      message:
        "We couldn't read this file automatically. It's saved safely — just fill in the details yourself below.",
    };
  }

  if (sd._mock) {
    return {
      kind: 'pending',
      message:
        'Automatic reading is still being set up, so nothing was filled in for this file. Add the details yourself below.',
    };
  }

  if (sd._extraction_warning) {
    return {
      kind: 'warning',
      message:
        'Some of this file was hard to read, so a few details may be missing. Please check them before confirming.',
    };
  }

  return { kind: 'ok' };
}

/** True when there is genuine extracted content, ignoring internal flags. */
export function hasExtractedContent(data: unknown): boolean {
  const sd = (data || {}) as Record<string, unknown>;
  return Object.entries(sd).some(([k, v]) => {
    if (INTERNAL_KEYS.includes(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

/** snake_case key -> readable label, e.g. follow_up_date -> "Follow up date". */
export function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
