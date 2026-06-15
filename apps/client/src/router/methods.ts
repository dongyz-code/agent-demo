import { router } from '.';
import { routePathMap } from './routes';

import type { NavigateOptions } from '@tanstack/react-router';
import type { RouteName, RoutePathMap } from './type';

type RouteNavigateOptions<Name extends RouteName> = NavigateOptions<
  typeof router,
  string,
  RoutePathMap[Name]
>;

export type RouterGoOptions<Name extends RouteName = RouteName> = {
  /** 动态路径参数，用于 `/users/$id` 这类路由。 */
  params?: RouteNavigateOptions<Name>['params'];
  /** 查询参数，会序列化到地址栏，例如 `{ page: 1, keyword: 'app' }`。 */
  search?: RouteNavigateOptions<Name>['search'];
  /** 地址哈希，不需要包含 `#`；传 `true` 时保留当前地址哈希。 */
  hash?: RouteNavigateOptions<Name>['hash'];
  /** 浏览器历史状态，不会出现在地址栏中。 */
  state?: RouteNavigateOptions<Name>['state'];
  /** 是否替换当前历史记录；默认会新增一条历史记录。 */
  replace?: RouteNavigateOptions<Name>['replace'];
  /** 跳转后是否重置滚动位置；默认由 TanStack Router 处理。 */
  resetScroll?: RouteNavigateOptions<Name>['resetScroll'];
  /** 带哈希跳转时，是否滚动到对应元素。 */
  hashScrollIntoView?: RouteNavigateOptions<Name>['hashScrollIntoView'];
  /** 是否启用浏览器视图过渡能力。 */
  viewTransition?: RouteNavigateOptions<Name>['viewTransition'];
  /** 是否忽略路由拦截器，例如未保存表单拦截。 */
  ignoreBlocker?: RouteNavigateOptions<Name>['ignoreBlocker'];
  /** 是否执行整页刷新跳转，绕过单页应用导航。 */
  reloadDocument?: RouteNavigateOptions<Name>['reloadDocument'];
};

export type RouterOpenOptions<Name extends RouteName = RouteName> = {
  /** 动态路径参数，用于 `/users/$id` 这类路由。 */
  params?: RouteNavigateOptions<Name>['params'];
  /** 查询参数，会序列化到新窗口地址栏。 */
  search?: RouteNavigateOptions<Name>['search'];
  /** 地址哈希，不需要包含 `#`；传 `true` 时保留当前地址哈希。 */
  hash?: RouteNavigateOptions<Name>['hash'];
  /** 新窗口目标，默认 `_blank`。 */
  target?: '_blank' | '_self' | '_parent' | '_top' | (string & {});
  /** 打开窗口时使用的窗口特性，默认 `noopener,noreferrer`。 */
  features?: string;
};

export function routerGo<Name extends RouteName>(
  name: Name,
  options: RouterGoOptions<Name> = {},
) {
  return router.navigate({
    ...options,
    to: routePathMap[name],
  });
}

export function routerGoHome(options: RouterGoOptions<'dashboard'> = {}) {
  return routerGo('dashboard', options);
}

export function routerGoLogin(options: RouterGoOptions<'login'> = {}) {
  return routerGo('login', options);
}

export function routerOpen<Name extends RouteName>(
  name: Name,
  {
    target = '_blank',
    features = 'noopener,noreferrer',
    ...options
  }: RouterOpenOptions<Name> = {},
) {
  const location = router.buildLocation({
    ...options,
    to: routePathMap[name],
  });

  return window.open(location.publicHref, target, features);
}

export function blank<Name extends RouteName>(
  name: Name,
  options: RouterOpenOptions<Name> = {},
) {
  return routerOpen(name, options);
}
