import App from './App.vue';
import { createApp } from 'vue';
import { router } from './router/router';
import { globalComponents } from './components/root';

import '@repo/ui/index.css';

const app = createApp(App);

app.use(router).use(globalComponents);

app.mount('#app');
