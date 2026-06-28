import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { APP } from './APP';
import { applyThemeBaseColors, defaultThemeBaseColors } from '@/theme/colors';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

applyThemeBaseColors(defaultThemeBaseColors);

createRoot(root).render(
  <StrictMode>
    <APP />
  </StrictMode>,
);
