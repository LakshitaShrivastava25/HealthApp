import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * One switch, two backends.
 *
 * Development and production are named separately below, and IS_PRODUCTION
 * picks between them. Flip it either way:
 *
 *   1. `EXPO_PUBLIC_USE_PRODUCTION_API=true` in `mobile/.env` (no code edit).
 *   2. The `USE_PRODUCTION_API` default below, if that env var is absent.
 *
 * Expo inlines EXPO_PUBLIC_* vars when the bundle is built, so restart the
 * dev server (`npm start -c`) after editing `.env`.
 *
 * In development there is usually no host worth hard-coding: a phone running
 * Expo Go cannot reach "localhost" — that name points at the phone itself,
 * not at the development machine. Expo already knows the dev machine's LAN
 * address, because that is how the JS bundle reached the device in the first
 * place, so the host is read back out of the Expo manifest.
 *
 * Development precedence:
 *   1. The in-app override the user typed on the login screen.
 *   2. EXPO_PUBLIC_API_URL_DEV, if set (a second machine, or a tunnel).
 *   3. The Expo dev-server host, with Django's port.
 *   4. Android emulator's 10.0.2.2 loopback alias, else localhost.
 */

/** Fallback used when EXPO_PUBLIC_USE_PRODUCTION_API is not set. */
const USE_PRODUCTION_API = false;

/** The live backend. Override from `.env` if the host changes. */
const DEFAULT_PRODUCTION_API_URL = 'https://api.healthnow.app/api';

const DJANGO_PORT = 8000;

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

/** Accepts "true"/"1"/"yes"/"on" in any casing; anything else is false. */
function readFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/** True when the app is pointed at the live backend rather than a dev machine. */
export const IS_PRODUCTION: boolean = readFlag(
  process.env.EXPO_PUBLIC_USE_PRODUCTION_API,
  USE_PRODUCTION_API,
);

export const PRODUCTION_API_URL = stripTrailingSlash(
  process.env.EXPO_PUBLIC_API_URL_PROD || DEFAULT_PRODUCTION_API_URL,
);

function hostFromExpo(): string | null {
  // hostUri looks like "192.168.1.7:8081" while developing.
  const legacyHost = (Constants as { manifest2?: { extra?: { expoGo?: { developer?: { host?: string } } } } })
    .manifest2?.extra?.expoGo?.developer?.host;
  const hostUri = Constants.expoConfig?.hostUri ?? legacyHost ?? null;
  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0];
  return host || null;
}

/** Where the backend lives on this machine's network, ignoring production. */
export function developmentBaseUrl(): string {
  // EXPO_PUBLIC_API_URL is the name earlier builds used; still honoured.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL_DEV || process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);

  const host = hostFromExpo();
  if (host) return `http://${host}:${DJANGO_PORT}/api`;

  // No Expo host — a standalone build, or the emulator.
  if (Platform.OS === 'android') return `http://10.0.2.2:${DJANGO_PORT}/api`;
  return `http://localhost:${DJANGO_PORT}/api`;
}

function defaultBaseUrl(): string {
  return IS_PRODUCTION ? PRODUCTION_API_URL : developmentBaseUrl();
}

/**
 * Mutable so the login screen's "Can't connect?" panel can point the app at
 * a different machine without a rebuild — genuinely useful when the dev
 * server and the phone end up on different subnets.
 */
let overrideBaseUrl: string | null = null;

export function setApiBaseUrl(url: string | null) {
  overrideBaseUrl = url ? stripTrailingSlash(url) : null;
}

export function getApiBaseUrl(): string {
  return overrideBaseUrl ?? defaultBaseUrl();
}

/** The site root (no /api) — needed for MEDIA_URL files and the public QR link. */
export function getServerRoot(): string {
  return getApiBaseUrl().replace(/\/api$/, '');
}

/**
 * Django returns FileField values as either an absolute URL or a
 * "/media/..." path depending on how the request arrived. Normalising here
 * keeps every image and download in the app from having to care.
 */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getServerRoot()}${path.startsWith('/') ? '' : '/'}${path}`;
}
