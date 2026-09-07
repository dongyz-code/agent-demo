import { lazyRouteComponent } from '@tanstack/react-router';
import { BotIcon, LayoutDashboardIcon, SettingsIcon } from 'lucide-react';

import type { RouteConfig, RouteMetaMap, RoutePathMap } from './type';

export const LazyNotFoundPage = lazyRouteComponent(
  () => import('@/pages/not-found'),
);
export const routes = [
  {
    name: 'dashboard',
    path: '/',
    layout: 'workspace',
    component: lazyRouteComponent(() => import('@/pages/dashboard')),
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
    component: lazyRouteComponent(() => import('@/pages/settings')),
    meta: {
      title: '设置',
      auth: true,
      nav: {
        icon: SettingsIcon,
        order: 20,
      },
    },
  },
  {
    name: 'agents',
    path: '/agents',
    layout: 'workspace',
    component: lazyRouteComponent(() => import('@/pages/agents')),
    meta: {
      title: 'Agents',
      auth: true,
      nav: {
        icon: BotIcon,
        order: 30,
      },
    },
  },
  {
    name: 'login',
    path: '/login',
    layout: 'auth',
    component: lazyRouteComponent(() => import('@/pages/login')),
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
