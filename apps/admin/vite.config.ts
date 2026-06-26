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
    alias: [
      { find: '@', replacement: join(__dirname, 'src') },
      // admin 直接消费 @repo/ui 源码（运行时 + HMR），不再走 dist 产物
      // 精确匹配，避免误伤 '@repo/ui/index.css'（仍走 package exports）
      { find: /^@repo\/ui$/, replacement: join(__dirname, '../../packages/ui/src/index.ts') },
    ],
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
