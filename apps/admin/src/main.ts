import App from './App.vue';
import { createApp } from 'vue';
import { applyThemeBaseColors, defaultThemeBaseColors } from '@repo/ui';
import { router } from './router/router';
import { pinia } from './plugins/pinia';
import { globalComponents } from './plugins/global-components';

import '@repo/ui/index.css';

applyThemeBaseColors(defaultThemeBaseColors);

const app = createApp(App);

app.use(pinia).use(router).use(globalComponents);

app.mount('#app');
