import path from 'node:path'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// import.meta.dirname rather than __dirname: Vite's upcoming native config
// loader does not provide the CJS globals.
const here = import.meta.dirname

/** Same rule as src/shared/apiConfig.ts's readFlag. */
function readFlag(raw: string | undefined, fallback: boolean) {
  if (raw === undefined || raw === '') return fallback
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

/**
 * A Content-Security-Policy for production builds.
 *
 * Tokens live in localStorage, so injected script is the one thing that
 * could read them; this tells the browser to run only this site's own
 * bundles and to talk only to this site and the API. Build-only: the dev
 * server relies on inline scripts for hot reload. Delivered as a <meta> tag
 * so it works on any static host — a host that can set response headers
 * should also send `frame-ancestors 'none'`, which a meta tag cannot carry.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  const api = new URL(apiUrl).origin
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Inline styles: framer-motion animates through style attributes, and
    // a few components inject <style> keyframes.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${api}`,
    `connect-src 'self' ${api}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'curapath-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, 'VITE_')
  const apiUrl = readFlag(env.VITE_USE_PRODUCTION_API, false)
    ? env.VITE_API_BASE_URL_PROD || 'https://invalid.example'
    : env.VITE_API_BASE_URL_DEV || 'http://localhost:8000/api'

  return {
    plugins: [react(), contentSecurityPolicy(apiUrl)],
    resolve: {
      alias: {
        // src/shared holds the auth UI, PhoneInput and country data used
        // across the patient/doctor/admin areas. Kept as an alias rather than
        // relative paths so a file can move between src/ depths without
        // rewriting every import — the importing files sit 3 levels deep
        // under src/<portal>/pages/, so spelled-out relative hops would be
        // noisier and easy to get wrong.
        '@shared': path.resolve(here, 'src/shared'),
        // Pinning these four guarantees a single React instance — two copies
        // would break hooks in ways that are painful to diagnose.
        react: path.resolve(here, 'node_modules/react'),
        'react-dom': path.resolve(here, 'node_modules/react-dom'),
        'framer-motion': path.resolve(here, 'node_modules/framer-motion'),
        'lucide-react': path.resolve(here, 'node_modules/lucide-react'),
      },
    },
  }
})
