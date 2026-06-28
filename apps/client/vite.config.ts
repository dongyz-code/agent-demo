import { defineConfig } from 'vitest/config';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import icons from 'unplugin-icons/vite';

export default defineConfig({
  server: {
    host: true,
    port: 9000,
  },
  plugins: [
    react(),
    icons({
      compiler: 'jsx',
      jsx: 'react',
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
