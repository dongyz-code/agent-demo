import { helperRouterMethod } from '@repo/ui';

import type { RouteName } from './type';

export * from './type';

export { useRouter } from '@repo/ui';

const loginName: RouteName = 'login';

export const { routerGo, routerGoHome, routerGoLogin, blank } =
  helperRouterMethod({
    homePage: {
      url: '/',
    },
    loginPage: () => {
      return {
        name: loginName,
        query: {
          redirect: location.href,
        },
      };
    },
  });
