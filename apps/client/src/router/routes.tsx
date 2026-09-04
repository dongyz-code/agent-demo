import { lazyRouteComponent } from '@tanstack/react-router';
import { LayoutDashboardIcon, SettingsIcon } from 'lucide-react';

import type {
  PermissionKey,
  RouteConfig,
  RouteMetaMap,
  RoutePathMap,
} from './type';

const LazyDashboardPage = lazyRouteComponent(
  () => import('@/pages/dashboard'),
  'DashboardPage',
);
const LazyLoginPage = lazyRouteComponent(
  () => import('@/pages/login'),
  'LoginPage',
);
export const LazyNotFoundPage = lazyRouteComponent(
  () => import('@/pages/not-found'),
  'NotFoundPage',
);
const LazySettingsPage = lazyRouteComponent(
  () => import('@/pages/settings'),
  'SettingsPage',
);

export const permissionKeys = {
  settingsView: 'settings.view',
} as const satisfies Record<string, PermissionKey>;

export const routes = [
  {
    name: 'dashboard',
    path: '/',
    layout: 'workspace',
    component: LazyDashboardPage,
    meta: {
      title: '工作台',
      auth: true,
      nav: {
        icon: LayoutDashboardIcon,
        order: 10,
      },
    },
  },
  {
    name: 'settings',
    path: '/settings',
    layout: 'workspace',
    component: LazySettingsPage,
    meta: {
      title: '设置',
      auth: true,
      permissions: [permissionKeys.settingsView],
      nav: {
        icon: SettingsIcon,
        order: 20,
      },
    },
  },
  {
    name: 'login',
    path: '/login',
    layout: 'auth',
    component: LazyLoginPage,
    meta: {
      title: '登录',
      auth: false,
      guestOnly: true,
    },
  },
  {
    name: 'notFound',
    path: '/404',
    layout: 'workspace',
    component: LazyNotFoundPage,
    meta: {
      title: '页面未找到',
      auth: false,
      nav: {
        icon: LayoutDashboardIcon,
        hidden: true,
      },
    },
  },
] as const satisfies readonly RouteConfig[];

export const routePathMap = Object.fromEntries(
  routes.map(({ name, path }) => [name, path]),
) as RoutePathMap;

export const routeMetaMap = Object.fromEntries(
  routes.map(({ name, meta }) => [name, meta]),
) as RouteMetaMap;
