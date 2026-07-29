import { defineConfig } from 'vite';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import icons from 'unplugin-icons/vite';

export default defineConfig({
  server: {
    host: true,
    port: 3005,
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
});
