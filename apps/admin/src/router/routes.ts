import { adminPermissionKey } from '@repo/shared/permission';

import type { RouteItem } from '@repo/ui';
import type { RouteName, Meta } from './types';

export const routes: RouteItem<RouteName, Meta>[] = [
  {
    path: '/',
    name: 'root',
    component: () => import('@/layouts/admin/index.vue'),
    meta: {
      withAuth: true,
    },
    children: [
      /** ============ 系统管理相关 ============ */
      {
        path: 'system',
        name: 'system',
        component: () => import('@/pages/system/index.vue'),
        children: [
          {
            path: 'user',
            name: 'system.user',
            component: () => import('@/pages/system/user/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.user')],
            },
            root: true,
          },
          {
            path: 'role',
            name: 'system.role',
            component: () => import('@/pages/system/role/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.role')],
            },
          },
          {
            path: 'app',
            name: 'system.app',
            component: () => import('@/pages/system/app/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.app')],
            },
          },
          {
            path: 'app-log',
            name: 'system.app-log',
            component: () => import('@/pages/system/app-log/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.app-log')],
            },
          },
          {
            path: 'user-log',
            name: 'system.user-log',
            component: () => import('@/pages/system/user-log/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.user-log')],
            },
          },
          {
            path: 'task',
            name: 'system.task',
            component: () => import('@/pages/system/task/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.task')],
            },
          },
          {
            path: 'table',
            name: 'system.table',
            component: () => import('@/pages/system/table/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.table')],
            },
          },
        ],
      },
      {
        path: 'file',
        name: 'file',
        component: () => import('@/pages/system/index.vue'),
        children: [
          {
            path: 'management',
            name: 'file.management',
            component: () => import('@/pages/file/management/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.documents.management')],
            },
            root: true,
          },
        ],
      },
      {
        path: 'rag',
        name: 'rag',
        component: () => import('@/pages/system/index.vue'),
        children: [
          {
            path: 'dataset',
            name: 'rag.dataset',
            component: () => import('@/pages/rag/dataset/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.documents.dataset')],
            },
            root: true,
          },
        ],
      },
    ],
    root: true,
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/login/index.vue'),
    meta: {
      withAuth: false,
    },
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/pages/not-found/index.vue'),
    meta: {
      withAuth: false,
    },
    pathMatch: true,
  },
];
