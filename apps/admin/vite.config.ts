import { defineConfig } from 'vite';
import { join } from 'node:path';
import vue from '@vitejs/plugin-vue';
import icons from 'unplugin-icons/vite';
import elementPlus from 'unplugin-element-plus/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import tailwindcss from '@tailwindcss/vite';

import type { PluginOption } from 'vite';

const plugins: PluginOption[] = [
  vue(),
  elementPlus({}),
  icons({
    compiler: 'vue3',
  }),
  visualizer({
    open: false,
    gzipSize: true,
    brotliSize: false,
    filename: 'rollup-plugin-visualizer.html',
  }),
  tailwindcss(),
];

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
  },
  plugins,
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // manualChunks(id) {
        //   if (id.includes('router')) {
        //     console.log(id);
        //   }
        // },
        advancedChunks: {
          groups: [
            { name: 'vue', test: /\/@vue|\/vue-router/ },
            // { name: 'echarts', test: /\/echarts/ },
            { name: 'element-plus', test: /\/element-plus/ },
          ],
        },
      },
    },
  },
});
