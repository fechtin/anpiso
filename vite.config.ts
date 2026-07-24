import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      // NOTE: Do NOT inject the Gemini API key via `define` — it would be baked
      // into the client bundle and exposed to every visitor. Users provide their
      // own key at runtime (stored in localStorage via apiKeyService).
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
              vendor: ['react', 'react-dom'],
              genai: ['@google/genai'],
            },
          },
        },
      },
    };
});
