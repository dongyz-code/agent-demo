import { adminPermissionKey } from '@repo/shared/permission';

import type { RouteItem } from '@repo/ui';
import type { RouteName, Meta } from './types';

/** 管理端路由声明；页面按需加载，访问权限统一放在 meta 中。 */
export const routes: RouteItem<RouteName, Meta>[] = [
  {
    path: '/',
    name: 'root',
    component: () => import('@/layouts/admin/index.vue'),
    meta: {
      withAuth: true,
    },
    children: [
      /** ============ 文档中心相关 ============ */
      {
        path: 'documents',
        name: 'documents',
        component: () => import('@/pages/system/index.vue'),
        children: [
          {
            path: 'list',
            name: 'documents.list',
            component: () => import('@/pages/document/list/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.documents.library')],
            },
          },
          {
            path: 'detail/:documentId',
            name: 'documents.detail',
            component: () => import('@/pages/document/detail.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.documents.library')],
            },
          },
          {
            path: 'library',
            name: 'documents.library',
            component: () => import('@/pages/document/library/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.documents.library')],
            },
          },
        ],
      },
      /** ============ 系统监控相关 ============ */
      {
        path: 'monitor',
        name: 'monitor',
        component: () => import('@/pages/system/index.vue'),
        children: [
          {
            path: 'schedule',
            name: 'monitor.schedule',
            component: () => import('@/pages/monitor/schedule/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.monitor.schedule')],
            },
          },
          {
            path: 'cache',
            name: 'monitor.cache',
            component: () => import('@/pages/monitor/cache/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.monitor.cache')],
            },
          },
          {
            path: 'table',
            name: 'monitor.table',
            component: () => import('@/pages/system/table/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.table')],
            },
          },
        ],
      },
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
            path: 'group',
            name: 'system.group',
            component: () => import('@/pages/system/group/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.group')],
            },
          },
          {
            path: 'dictionary',
            name: 'system.dictionary',
            component: () => import('@/pages/system/dictionary/index.vue'),
            meta: {
              permissions: [adminPermissionKey('pages.sys.sys.dictionary')],
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
        ],
      },
    ],
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
