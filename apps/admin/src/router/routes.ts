import type { RouteItem } from '@repo/ui';
import type { RouteName, Meta } from './type';

export const routes: RouteItem<RouteName, Meta>[] = [
  {
    path: '/main',
    name: 'main',
    component: () => import('@/views/main/index.vue'),
    meta: {
      withAuth: true,
    },
    children: [
      /** ============ 系统管理相关 ============ */
      {
        path: 'sys',
        name: 'sys',
        component: () => import('@/views/sys/index.vue'),
        children: [
          {
            path: '/main/user',
            name: 'sys.user',
            component: () => import('@/views/sys/user/index.vue'),
            root: true,
          },
          {
            path: '/main/role',
            name: 'sys.role',
            component: () => import('@/views/sys/role/index.vue'),
          },
          {
            path: '/main/app',
            name: 'sys.app',
            component: () => import('@/views/sys/app/index.vue'),
          },
          {
            path: '/main/app-log',
            name: 'sys.app-log',
            component: () => import('@/views/sys/app-log/index.vue'),
          },
          {
            path: '/main/user-log',
            name: 'sys.user-log',
            component: () => import('@/views/sys/user-log/index.vue'),
          },
          {
            path: '/main/task',
            name: 'sys.task',
            component: () => import('@/views/sys/task/index.vue'),
          },
          {
            path: '/main/table',
            name: 'sys.table',
            component: () => import('@/views/sys/table/index.vue'),
          },
        ],
      },
    ],
    root: true,
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      withAuth: false,
    },
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/views/not-found/index.vue'),
    meta: {
      withAuth: false,
    },
    pathMatch: true,
  },
];
