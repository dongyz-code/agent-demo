import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import elementPlus from 'unplugin-element-plus/vite';

/** Vitest 配置，专门用于组件测试时处理 Vue SFC 和 Element Plus 样式依赖。 */
export default defineConfig({
  plugins: [vue(), elementPlus({})],
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['element-plus'],
      },
    },
  },
});
