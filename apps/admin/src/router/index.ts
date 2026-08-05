import { helperRouterMethod } from '@repo/ui';

import type { RouteName } from './types';

export * from './types';

export { useRouter } from '@repo/ui';

const loginName: RouteName = 'login';

/** 管理端统一路由跳转方法，供页面通过路由实例完成导航。 */
export const { routerGo, routerGoHome, routerGoLogin, routeGoBack, blank } =
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
