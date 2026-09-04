import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { APP } from './APP';
import { applyThemeMode, useThemeModel } from './model/theme';
import '@/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

const initialThemeMode = useThemeModel.getState().themeMode;
applyThemeMode(initialThemeMode);

createRoot(root).render(
  <StrictMode>
    <APP />
  </StrictMode>,
);
