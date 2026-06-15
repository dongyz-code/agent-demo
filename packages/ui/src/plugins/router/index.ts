import { createRouter, createWebHistory } from 'vue-router';
import { useRouter, installRouter } from './use';
import { getRoutes } from './get-routes';
import { sleep } from '@repo/utils-browser';

import type { Store } from 'pinia';
import type {
  Router,
  RouteLocationRaw,
  RouteLocationNamedRaw,
  RouteLocationNormalized,
} from 'vue-router';
import type { BeString } from '@/types';
import type { RouteItem, RouteMeta } from './type';
import type { App } from 'vue';
import type { Progress } from '../progress';

export * from './type';
export * from './use';

/** 新窗口打开 */
export function blank(options: string | RouteLocationNamedRaw) {
  if (typeof options === 'string') {
    window.open(options, '_blank');
  } else {
    const { href } = useRouter().resolve(options);
    window.open(href, '_blank');
  }
}

type LocationExtra<T extends string> =
  | (Omit<RouteLocationNamedRaw, 'name'> & { name: T })
  | {
      url: string;
    };

type FuncWrap<T> = T | (() => T);

/** 路由方法，不依赖 routes */
export function helperRouterMethod<RouteName extends string = string>({
  homePage,
  loginPage,
}: {
  /** 首页，默认跳转路由 */
  homePage: FuncWrap<LocationExtra<RouteName>>;
  /** 登录页，身份认证失败跳转路由 */
  loginPage: FuncWrap<LocationExtra<RouteName>>;
}) {
  /**
   * https://router.vuejs.org/zh/api/#custom
   *
   * 如果直接 push 嵌套路由的 name, 不会自动重定向到底下的 root 哈（保留这个）
   *
   * https://router.vuejs.org/zh/guide/essentials/nested-routes.html
   *
   * 不提供 name 参数，则跳转 /
   */
  async function routerGo(
    name?: RouteName,
    options: Omit<RouteLocationNamedRaw, 'name'> & {
      /** 新页面打开 */
      blank?: boolean;
    } = {},
  ) {
    const router = useRouter();
    if (!name) {
      await router.push({ path: '/' });
    } else {
      const location: RouteLocationNamedRaw = {
        name,
        ...options,
      };
      if (options.blank) {
        blank(location);
      } else {
        await router.push(location);
      }
    }
  }

  async function routerGoLogin() {
    const router = useRouter();
    const data = typeof loginPage === 'function' ? loginPage() : loginPage;
    if (typeof data === 'object' && 'url' in data) {
      location.href = data.url;
    } else {
      await router.push(data);
    }
  }

  async function routerGoHome() {
    const router = useRouter();
    const data = typeof homePage === 'function' ? homePage() : homePage;
    if (typeof data === 'object' && 'url' in data) {
      location.href = data.url;
    } else {
      await router.push(data);
    }
  }

  function routeGoBack() {
    const router = useRouter();
    router.go(-1);
  }

  return {
    /** 路由跳转的全局方法 */
    routerGo,
    /** 跳转登录页面 */
    routerGoLogin,
    /** 跳转首页 */
    routerGoHome,
    /** 新窗口打开 */
    blank,
    /** 返回上一页 */
    routeGoBack,
  };
}

/** 添加路由元信息 */
function addMeta<T extends RouteItem[]>({
  routes,
  routeNameMap,
  parentMeta,
}: {
  routes: T;
  routeNameMap: Record<string, string>;
  parentMeta?: Partial<RouteMeta>;
}): T {
  return routes.map((item) => {
    const { meta = {}, ...itemRest } = item;
    const { withAuth = true, onlyAdmin = false, ...metaRest } = meta;
    const nextItem: typeof item = {
      ...itemRest,
      meta: {
        title: routeNameMap[item.name],
        withAuth: parentMeta?.withAuth ? true : withAuth,
        onlyAdmin: parentMeta?.onlyAdmin ? true : onlyAdmin,
        ...metaRest,
      },
    };
    if (item.children?.length) {
      nextItem.children = addMeta({
        routes: item.children,
        routeNameMap,
        parentMeta: nextItem.meta,
      });
    }
    return nextItem;
  }) as T;
}

/** 路由前置拦截返回值
 *
 * 1. void / undefined 意味着不拦截
 * 2. RouteLocationRaw 意味着需要跳转到指定页面
 * 3. false 意味中断跳转
 */
type RouteProxyResult =
  | void
  | undefined
  | RouteLocationRaw
  | false
  | { url: string };

/** 路由方法，权限判断等
 *
 * 1. 如果 to.name 为空，说明是 404 页面，不拦截跳转，路由自动处理(pathMatch)
 * 2. 如果 to.meta.withAuth 为 false, 不拦截跳转，路由自动处理
 * 3. 如果 to.meta.withAuth 为 true，如果为 true，请求用户信息（建议禁用API异常自动跳转，手动控制）
 * 4. 身份信息拿到后再进行 权限判断，如果没有权限，不提示无权限，而是直接跳转 404 页面
 *
 */
export function helperRouter<
  RouteNameMap extends Record<string, string>,
  UseStore extends () => Store<
    string,
    {
      user?: {
        sys_admin?: boolean;
      } | null;
      [key: string]: any;
    }
  >,
>(body: {
  /** BASE */
  base: string;
  /** 路由 title 映射  */
  routeNameMap: RouteNameMap;
  /** 路由配置 */
  routes: RouteItem<BeString<keyof RouteNameMap>, RouteMeta>[];
  /** 用户信息，默认是拿到了用户视为已经登录 */
  useStore: UseStore;
  /** progress 方法 */
  progress: Progress;
  /** 404 页面 */
  notFound: keyof RouteNameMap;
  /**
   * 1. 身份信息校验, 校验失败跳转指定页面，需要禁用API自动跳转
   */
  apiUserJudge: (_: {
    useStore: UseStore;
    router: Router;
    to: RouteLocationNormalized;
  }) => RouteProxyResult | Promise<RouteProxyResult>;
  /**
   * 1. 页面权限校验，用户登录后，用户无法访问某些页面的情况下，允许重定向到其他页面
   */
  pagePermissionJudge: (_: {
    useStore: UseStore;
    router: Router;
    to: RouteLocationNormalized;
  }) => RouteProxyResult;
  /** 其他可选配置 */
  opts?: {
    /** 管理员是否直接不判断权限，直接返回 true，除非明确设为 false，不然就是不判断权限
     *
     * 设为false需要注意保证管理员的页面权限是全部，不然可能会出现管理员无法访问某些页面的情况
     */
    adminNoJudge?: boolean;
  };
}) {
  const {
    useStore,
    pagePermissionJudge,
    apiUserJudge,
    routeNameMap,
    routes,
    base,
    progress,
    notFound,
  } = body;

  const router = createRouter({
    history: createWebHistory(base),
    routes: getRoutes(addMeta({ routes, routeNameMap })),
    scrollBehavior(to) {
      if (to.hash) {
        return {
          el: to.hash,
          top: 64,
        };
      }
      return {
        top: 0,
      };
    },
  });

  /** 权限判断, 此时一定是拿到了用户信息了 */
  function permissionJudge(to: RouteLocationNormalized): RouteProxyResult {
    const meta = to.meta as RouteMeta;

    const { user } = useStore();

    /** 管理员可以不限制权限, 跳过后续处理 */
    if (user?.sys_admin && body.opts?.adminNoJudge !== false) {
      return;
    }

    if (meta.onlyAdmin) {
      return user?.sys_admin ? undefined : false;
    } else {
      return pagePermissionJudge({ useStore, to, router });
    }
  }

  /** 路由前置拦截 */
  async function routeProxy(
    to: RouteLocationNormalized,
  ): Promise<RouteProxyResult> {
    if (!to.name) {
      return {
        name: notFound as string,
      };
    }

    const meta = to.meta as RouteMeta;

    if (!meta.withAuth) {
      return;
    }

    const store = useStore();

    if (!store.user) {
      const resp = await apiUserJudge({ useStore, router, to });
      if (resp !== undefined) {
        return resp;
      }
    }

    const allow = permissionJudge(to);

    if (allow === false) {
      return { name: notFound as string, params: { pathMatch: to.path } };
    }
    return allow;
  }

  router.beforeEach(async (to) => {
    progress.start();
    const redirect = await routeProxy(to);
    if (redirect !== undefined) {
      if (typeof redirect === 'object' && 'url' in redirect) {
        location.href = redirect.url;
        await sleep(1e6);
      } else {
        return redirect;
      }
    }
  });

  router.afterEach(({ meta }) => {
    progress.close();
    document.title = (meta as RouteMeta).title || document.title;
  });

  const routerInstall = {
    install(app: App) {
      app.use(router);
      installRouter(router);
    },
  };

  return {
    router: routerInstall,
    routerInstance: router,
  };
}
