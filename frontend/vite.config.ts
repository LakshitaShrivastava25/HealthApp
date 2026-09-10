import path from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// import.meta.dirname rather than __dirname: Vite's upcoming native config
// loader does not provide the CJS globals.
const here = import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
