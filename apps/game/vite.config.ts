import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

const appVersion = process.env.VITE_APP_VERSION ?? packageJson.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
