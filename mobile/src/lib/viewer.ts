import { router, type Href } from 'expo-router';

import { absoluteUrl } from './config';

/**
 * Opens an uploaded file in the in-app viewer (app/viewer.tsx).
 *
 * `type` is the API's file_type / license_document_type — 'pdf', 'image',
 * 'heic' or 'other' — so the viewer never has to guess from the URL, which
 * is a signed /api/files/?t=... link that does not end in an extension.
 */
export function openFile(file: string | null | undefined, type?: string | null, title?: string | null) {
  const url = absoluteUrl(file);
  if (!url) return;
  router.push({ pathname: '/viewer', params: { url, type: type ?? '', title: title ?? '' } } as unknown as Href);
}
