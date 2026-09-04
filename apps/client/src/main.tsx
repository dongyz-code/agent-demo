import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyThemeBaseColors } from '@repo/ui/theme';

import { APP } from './APP';
import { applyThemeMode, useThemeModel } from './model/theme';
import '@/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

/** Client 使用 ai-pptx 的完整基础色板，避免只替换品牌色造成语义色不一致。 */
applyThemeBaseColors({
  primary: '#a855f7',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
});

const initialThemeMode = useThemeModel.getState().themeMode;
applyThemeMode(initialThemeMode);

createRoot(root).render(
  <StrictMode>
    <APP />
  </StrictMode>,
);
