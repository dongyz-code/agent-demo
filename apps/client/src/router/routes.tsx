import { lazyRouteComponent } from '@tanstack/react-router';
import LucideLayoutDashboard from '~icons/lucide/layout-dashboard';
import LucideSettings from '~icons/lucide/settings';

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
      title: 'Dashboard',
      auth: true,
      nav: {
        icon: LucideLayoutDashboard,
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
      title: 'Settings',
      auth: true,
      permissions: [permissionKeys.settingsView],
      nav: {
        icon: LucideSettings,
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
      title: 'Sign In',
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
      title: 'Not Found',
      auth: false,
      nav: {
        icon: LucideLayoutDashboard,
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
