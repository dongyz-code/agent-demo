import { getKeys } from '@repo/utils-browser';

import type { RouteMeta } from '@repo/ui';

export const routeNameMap = {
  login: '登录',
  'not-found': '404',
  main: '',

  /** ============ 系统管理相关 ============ */

  'sys.user': '用户管理',
  'sys.role': '角色管理',
  'sys.app': '接口管理',
  'sys.app-log': '接口日志',
  'sys.user-log': '操作日志',
  'sys.task': '任务管理',
  'sys.table': '表管理',

  /** ============ 业务相关 ============ */

  'app.list': '应用列表',
};

export type RouteName = keyof typeof routeNameMap;

export type Meta = RouteMeta & {
  /** 路由是否在盒子里 */
  box?: boolean;
};

export function helperRouterName<T extends RouteName>(name: T) {
  return {
    label: routeNameMap[name],
    value: name,
  };
}

/** 所有页面 value */
export const allPage = getKeys(routeNameMap);
