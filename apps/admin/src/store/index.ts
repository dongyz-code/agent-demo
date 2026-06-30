import { defineStore, createPinia } from 'pinia';
import { routes } from '@/router/routes';
import {
  hasAllPermissions,
  hasAdminPermissionKey,
  normalizeAdminPermissionKeys,
} from '@repo/shared/permission';

import type { StoreData } from './type';
import type { AdminPermissionKey } from '@repo/shared/permission';
import type { RouteItem } from '@repo/ui';
import type { Meta, RouteName } from '@/router/type';

const defaultData: StoreData = {
  permission: [],
  SYS_CONF: {},
  user: null,
  NAV_MODE: 'horizontal',
  NAV_COLLAPSE: false,
};

const pinia = createPinia();

/**
 * 将登录态权限数组转换成有效权限 Set。
 *
 * @param permission 当前登录用户权限列表。
 * @returns 过滤未知 key 后的权限集合，便于页面复用。
 */
function toPermissionSet(permission: readonly string[] | null | undefined) {
  return new Set(normalizeAdminPermissionKeys(permission ?? []));
}

/**
 * 根据路由 meta 和当前权限集合推导可访问 route name。
 *
 * @param routeItems admin 路由配置。
 * @param permissionSet 当前登录用户权限集合。
 * @param sysAdmin 当前用户是否是系统管理员。
 * @returns 当前用户允许访问的 route name 集合；壳路由只在有可访问子路由时加入。
 */
function collectAllowedRouteNames(
  routeItems: readonly RouteItem<RouteName, Meta>[],
  permissionSet: ReadonlySet<string>,
  sysAdmin = false,
) {
  const result = new Set<RouteName>();

  const visit = (route: RouteItem<RouteName, Meta>): boolean => {
    let childrenAllowed = false;
    route.children?.forEach((item) => {
      childrenAllowed = visit(item) || childrenAllowed;
    });
    const required = route.meta?.permissions ?? [];
    const isPublic = route.meta?.withAuth === false;
    const isShell = Boolean(route.children?.length);
    const selfAllowed =
      isPublic ||
      sysAdmin ||
      (required.length
        ? hasAllPermissions(permissionSet, required)
        : !isShell);

    if (selfAllowed || childrenAllowed) {
      result.add(route.name);
      return true;
    }
    return false;
  };

  routeItems.forEach((route) => {
    visit(route);
  });

  return result;
}

/** 全局共享 */
const store = defineStore('main', {
  state: () => defaultData,
  getters: {
    /** 当前用户有效权限集合，先过滤未知 key 再转 Set，供页面和路由守卫复用。 */
    permissionSet(state: StoreData) {
      return toPermissionSet(state.permission);
    },
    /** 根据当前用户权限推导可访问页面，系统管理员始终拥有全部页面。 */
    userPage(state: StoreData) {
      return collectAllowedRouteNames(
        routes,
        toPermissionSet(state.permission),
        state.user?.sys_admin,
      );
    },
  },
  actions: {
    /**
     * 判断当前用户是否拥有指定 admin 权限。
     *
     * @param key 需要判断的权限 key。
     * @returns 系统管理员或当前权限集合包含目标 key/同分支父级 key 时返回 true。
     */
    hasPermission(key: AdminPermissionKey) {
      return (
        this.user?.sys_admin === true ||
        hasAdminPermissionKey(this.permissionSet, key)
      );
    },
    stateSet(val: Partial<StoreData>) {
      Object.assign(this.$state, val);
    },
  },
});

export const useStore = () => store(pinia);
