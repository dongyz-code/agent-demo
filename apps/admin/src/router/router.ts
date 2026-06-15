import { helperRouter } from '@repo/ui';
import { useStore } from '@/store';
import { api } from '@/api';
import { routes } from './routes';
import { routeNameMap } from './type';
import { BASE_URL } from '@/configs';
import { progress } from '@/plugins/progress';
import { loginHandle } from '@/hooks/login';

import type { RouteName } from './type';

export const { router, routerInstance } = helperRouter({
  base: import.meta.env.BASE_URL,
  routeNameMap,
  progress,
  notFound: 'not-found',
  useStore,
  pagePermissionJudge({ to }) {
    const matched = to.matched;
    if (matched.every((item) => !item.meta.withAuth)) {
      return;
    }
    const { userPage } = useStore();
    if (userPage.has(to.name as RouteName)) {
      return;
    }
    return false;
  },
  async apiUserJudge({ to }) {
    const { user } = useStore();
    if (!user) {
      const resp = await api('/login/verify', {});
      loginHandle(resp);
    }
  },
  routes,
});

// setTimeout(() => {
//   console.log([
//     BASE_URL,
//     routerInstance.currentRoute.value,
//     routerInstance.getRoutes(),
//   ]);
// }, 1e3);
