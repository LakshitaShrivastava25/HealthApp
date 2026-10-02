/**
 * One switch, two backends.
 *
 * Every part of the web app — patient, doctor, admin, landing — asks this
 * module where the API lives, so moving the whole frontend between the local
 * Django server and the deployed one is a single change.
 *
 * Two ways to flip it, in order of precedence:
 *
 *   1. `VITE_USE_PRODUCTION_API=true` in `frontend/.env` (no code edit).
 *   2. The `USE_PRODUCTION_API` default below, if the env var is absent.
 *
 * Vite inlines env vars at build time, so restart `npm run dev` (or rebuild)
 * after changing `.env` — a hot reload will not pick it up.
 */

/** Fallback used when VITE_USE_PRODUCTION_API is not set. Edit freely. */
const USE_PRODUCTION_API = false;

/** The two backends. Override either one from `.env` if a host changes. */
const DEFAULT_DEVELOPMENT_API_URL = 'http://localhost:8000/api';
/**
 * No production default on purpose: an old placeholder host here would
 * silently send real traffic to the wrong place if `VITE_API_BASE_URL_PROD`
 * were ever missing. This is client code, so `vite build` can't catch a
 * missing var itself — instead the app throws as soon as it loads in a
 * browser without one set (see the check below), which is loud, but only
 * at page-load time, not at build time. Set `VITE_API_BASE_URL_PROD` in
 * your build environment (e.g. Render) to avoid hitting it.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Accepts "true"/"1"/"yes"/"on" in any casing; anything else is false. */
function readFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/** True when the app is pointed at the live backend rather than localhost. */
export const IS_PRODUCTION: boolean = readFlag(
  import.meta.env.VITE_USE_PRODUCTION_API,
  USE_PRODUCTION_API,
);

export const DEVELOPMENT_API_URL = stripTrailingSlash(
  import.meta.env.VITE_API_BASE_URL_DEV || DEFAULT_DEVELOPMENT_API_URL,
);

const RAW_PRODUCTION_API_URL = import.meta.env.VITE_API_BASE_URL_PROD;
if (IS_PRODUCTION && !RAW_PRODUCTION_API_URL) {
  // Only enforced when production mode is actually selected, so local dev
  // (IS_PRODUCTION=false) never needs this var set. Loud and immediate here
  // beats a build that quietly ships pointed at nothing.
  throw new Error(
    'VITE_API_BASE_URL_PROD is not set. Add it to frontend/.env (or your ' +
      'build environment) before building with VITE_USE_PRODUCTION_API=true ' +
      '— there is no built-in fallback host.',
  );
}

export const PRODUCTION_API_URL = RAW_PRODUCTION_API_URL
  ? stripTrailingSlash(RAW_PRODUCTION_API_URL)
  : '';

/** The API root every client should use, e.g. "http://localhost:8000/api". */
export const API_BASE_URL = IS_PRODUCTION ? PRODUCTION_API_URL : DEVELOPMENT_API_URL;

/** The site root with no `/api` — for MEDIA_URL files and public QR links. */
export const SERVER_ROOT = API_BASE_URL.replace(/\/api$/, '');

if (import.meta.env.DEV) {
  // Which backend a dev build is talking to is the first thing you want to
  // know when a request fails, and the least obvious from the UI.
  console.info(
    `[CuraPath] API target: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'} → ${API_BASE_URL}`,
  );
}
