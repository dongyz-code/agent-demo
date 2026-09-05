import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { APP } from './APP';
import { configureAuthLifecycle, getSessionEpoch } from './model/session';
import { applyThemeMode, useThemeModel } from './model/theme';
import { router } from './router';
import { routerGoLogin } from './router/methods';
import '@/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

const initialThemeMode = useThemeModel.getState().themeMode;
applyThemeMode(initialThemeMode);
useThemeModel.subscribe(({ themeMode }) => {
  applyThemeMode(themeMode);
});

/**
 * 注册应用级认证失效处理，确保 API 拦截器在首个请求前已有路由协调器。
 */
configureAuthLifecycle(async (epoch) => {
  if (getSessionEpoch() !== epoch) {
    return;
  }
  try {
    await router.invalidate();
  } catch {
    // 当前路由可能已经因认证失效重定向，继续执行登录页替换。
  }
  if (getSessionEpoch() !== epoch) {
    return;
  }
  await routerGoLogin({ replace: true });
});

createRoot(root).render(
  <StrictMode>
    <APP />
  </StrictMode>,
);
