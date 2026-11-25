import { helperRouterName } from '@/router/types';

import MajesticonsApplications from '~icons/majesticons/applications';
import LucideFolderOpen from '~icons/lucide/folder-open';
import LucideActivity from '~icons/lucide/activity';

import type { MenuItem } from './types';
import type { RouteName } from '@/router/types';

/** 侧栏菜单项。分组用 shell 对应壳路由，叶子用 value 对应页面。 */
type AdminMenuItem = MenuItem<
  RouteName,
  { shell?: RouteName; opened?: boolean }
>;

/**
 * 后台菜单顺序。文档中心、系统管理和系统监控按组展示，进入后台时按顺序寻找有权限的页面。
 */
export const adminMenu: AdminMenuItem[] = [
  {
    label: '文档中心',
    icon: LucideFolderOpen,
    shell: 'documents',
    opened: true,
    children: [
      helperRouterName('documents.list'),
      helperRouterName('documents.library'),
    ],
  },
  {
    label: '系统管理',
    icon: MajesticonsApplications,
    shell: 'system',
    children: [
      helperRouterName('system.user'),
      helperRouterName('system.role'),
      helperRouterName('system.group'),
      helperRouterName('system.app'),
      helperRouterName('system.app-log'),
      helperRouterName('system.user-log'),
      helperRouterName('system.task'),
      helperRouterName('system.table'),
    ],
  },
  {
    label: '系统监控',
    icon: LucideActivity,
    shell: 'monitor',
    children: [
      helperRouterName('monitor.schedule'),
      helperRouterName('monitor.runs'),
      helperRouterName('monitor.cache'),
    ],
  },
];

/** 只承载子页面、自己没有内容的壳路由。 */
const shellRoutes = new Set<RouteName>([
  'root',
  'system',
  'documents',
  'monitor',
]);

/**
 * 判断路由是不是没有独立页面的壳。
 *
 * @param name 当前路由名。
 * @returns 壳路由返回 true。
 */
export function isShellRoute(name: string): name is RouteName {
  return shellRoutes.has(name as RouteName);
}

/**
 * 按菜单顺序找第一个当前用户能进入的页面。
 *
 * @param allowed 当前用户可访问的路由名。
 * @param shell 只在某个分组里找；不传则从整个菜单的第一项开始。
 * @returns 页面路由名；没有任何可进入页面时返回空。
 */
export function firstAllowedRoute(
  allowed: ReadonlySet<string>,
  shell?: RouteName,
) {
  const groups =
    shell && shell !== 'root'
      ? adminMenu.filter((item) => item.shell === shell)
      : adminMenu;
  return findLeaf(groups, allowed);
}

/**
 * 深度优先查找第一个有权限的叶子页面。
 *
 * @param items 当前层菜单。
 * @param allowed 当前用户可访问的路由名。
 * @returns 页面路由名；这一层都没有时返回空。
 */
function findLeaf(
  items: readonly AdminMenuItem[],
  allowed: ReadonlySet<string>,
): RouteName | null {
  for (const item of items) {
    if ('children' in item) {
      const found = findLeaf(item.children, allowed);
      if (found) return found;
      continue;
    }
    if (allowed.has(item.value)) return item.value;
  }
  return null;
}
