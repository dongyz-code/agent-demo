import { defineConfig } from 'vite';
import { join } from 'node:path';
import vue from '@vitejs/plugin-vue';
import icons from 'unplugin-icons/vite';
import elementPlus from 'unplugin-element-plus/vite';
import dts from 'unplugin-dts/vite';
import libAssetsPlugin from '@laynezh/vite-plugin-lib-assets';
import { visualizer } from 'rollup-plugin-visualizer';
import tailwindcss from '@tailwindcss/vite';

import type { PluginOption, UserConfig } from 'vite';

/** https://vitejs.dev/config/ */
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  const plugins: PluginOption[] = [
    vue(),
    icons({
      compiler: 'vue3',
    }),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: false,
      filename: 'rollup-plugin-visualizer.html',
    }),
    dts({
      tsconfigPath: './tsconfig.app.json',
      processor: 'vue',
    }),
    libAssetsPlugin({}),
    tailwindcss({}),
  ];

  if (!isBuild) {
    plugins.push(elementPlus({}));
  }

  const config: UserConfig = {
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
      lib: {
        entry: join(__dirname, 'src/index.ts'),
        formats: ['es'],
        fileName: 'index',
        cssFileName: 'index',
      },
      minify: false,
      emitAssets: true,
      rollupOptions: {
        external: [
          '@repo/utils-browser',
          '@vueuse/components',
          '@vueuse/core',
          'element-plus',
          'vue',
          'vue-router',
        ],
        // output: {
        //   manualChunks(id) {
        //     console.log(id);
        //   },
        // },
      },
    },
  };
  return config;
});
