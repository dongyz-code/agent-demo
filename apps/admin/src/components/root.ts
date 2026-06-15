import { ElLoading } from 'element-plus';

import type { App } from 'vue';

export const globalComponents = {
  install: (app: App) => {
    app.use(ElLoading);
  },
};
