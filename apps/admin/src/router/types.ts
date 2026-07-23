import { getKeys } from '@repo/utils-browser';

import type { RouteMeta } from '@repo/ui';
import type { AdminPermissionKey } from '@repo/shared/permission';

export const routeNameMap = {
  login: '登录',
  'not-found': '404',
  root: '',

  /** ============ 系统管理相关 ============ */

  system: '系统管理',
  'system.user': '用户管理',
  'system.role': '角色管理',
  'system.app': '接口管理',
  'system.app-log': '接口日志',
  'system.user-log': '操作日志',
  'system.task': '任务管理',
  'system.table': '表管理',

  /** ============ 文件中心相关 ============ */

  file: '文档中心',
  'file.management': '文档管理',

  /** ============ RAG 管理相关 ============ */

  rag: 'RAG 管理',
  'rag.dataset': '知识库管理',
};

export type RouteName = keyof typeof routeNameMap;

export type Meta = RouteMeta & {
  /** 路由是否在盒子里。 */
  box?: boolean;
  /** 访问当前业务页面需要满足的权限；壳路由和公开路由可不配置。 */
  permissions?: readonly AdminPermissionKey[];
};

export function helperRouterName<T extends RouteName>(name: T) {
  return {
    label: routeNameMap[name],
    value: name,
  };
}

/** 所有页面 value */
export const allPage = getKeys(routeNameMap);
