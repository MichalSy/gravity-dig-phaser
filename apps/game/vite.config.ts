import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

const appVersion = process.env.VITE_APP_VERSION ?? packageJson.version;
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        runtime: resolve(import.meta.dirname, 'runtime.html'),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
