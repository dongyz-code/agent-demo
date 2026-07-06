import { helperRouterMethod } from '@repo/ui';

import type { RouteName } from './types';

export * from './types';

export { useRouter } from '@repo/ui';

const loginName: RouteName = 'login';

export const { routerGo, routerGoHome, routerGoLogin, blank } =
  helperRouterMethod({
    homePage: {
      url: '/',
    },
    loginPage: () => {
      if (location.pathname.endsWith('/login')) {
        return {
          name: loginName,
        };
      }

      return {
        name: loginName,
        query: {
          redirect: location.href,
        },
      };
    },
  });
