import { getKeys } from '@repo/utils-browser';

import { helper } from './type';
import { routeNameMap } from '@/router';

import type { RouteName } from '@/router';
import type { HandlePModel, PModel, PType } from './type';
import type { ConditionalKeys } from '@/types';

/** 所有的权限 key & type */
type PKeyType = HandlePModel<typeof pModel>;

/** 页面权限 */
export type PPage = ConditionalKeys<PKeyType, 'page'>;

/** 模块权限 */
export type PModule = ConditionalKeys<PKeyType, 'module'>;

/** 功能/数据权限 */
export type PAction = ConditionalKeys<PKeyType, 'action'>;

/** 所有权限 */
export type PKey = PPage | PModule | PAction;

/** 树形权限 */
export type TreePanel = {
  /** PKey  */
  key: string;
  label: string;
  type: PType;
  router?: RouteName;
  childs?: TreePanel[];
};

function pageName<T extends RouteName>(val: T) {
  return val;
}
function usePage<T extends RouteName>(val: T) {
  return {
    type: 'page' as const,
    label: routeNameMap[val],
  };
}

const pModel = helper({
  pages: {
    type: 'group',
    label: '页面权限',
    children: {
      sys: {
        type: 'group',
        label: '系统管理',
        children: {
          [pageName('sys.user')]: usePage('sys.user'),
          [pageName('sys.role')]: usePage('sys.role'),
          [pageName('sys.app')]: usePage('sys.app'),
          [pageName('sys.app-log')]: usePage('sys.app-log'),
          [pageName('sys.user-log')]: usePage('sys.user-log'),
          [pageName('sys.task')]: usePage('sys.task'),
          [pageName('sys.table')]: usePage('sys.table'),
        },
      },
    },
  },
  actions: {
    type: 'group',
    label: '操作权限',
    children: {
      table: {
        type: 'group',
        label: '表管理',
        children: {
          view: {
            type: 'action',
            label: '查看表清单',
          },
          preview: {
            type: 'action',
            label: '查看 Demo 数据',
          },
          rename: {
            type: 'action',
            label: '重命名表结构',
          },
          reset: {
            type: 'action',
            label: '根据 schema 重置',
          },
        },
      },
    },
  },
});

const pMap = new Map<
  PKey,
  {
    type: PType;
    router?: RouteName;
  }
>();

function setPMap(val: PModel, prefix = '') {
  getKeys(val).forEach((key) => {
    const { type, children } = val[key]!;
    if (children) {
      setPMap(children, `${prefix}${key}.`);
    }
    pMap.set(`${prefix}${key}` as PKey, {
      type,
      router: type === 'page' ? (key as RouteName) : undefined,
    });
  });
}

setPMap(pModel);

function buildTree(val: PModel, prefix = ''): TreePanel[] {
  return getKeys(val).map((key) => {
    const item = val[key]!;
    const fullKey = `${prefix}${key}`;
    return {
      key: fullKey,
      label: item.label,
      type: item.type,
      router: item.type === 'page' ? (key as RouteName) : undefined,
      childs: item.children
        ? buildTree(item.children, `${fullKey}.`)
        : undefined,
    };
  });
}

export const allP = buildTree(pModel);

export const allKeys = {} as Record<PKey, true>;

for (const key of pMap.keys()) {
  allKeys[key] = true;
}

export function usePermission(permission: PKey[]) {
  const result = permission.map((key) => pMap.get(key)!).filter(Boolean);

  return {
    routes: result.map((item) => item.router!).filter(Boolean),
  };
}
