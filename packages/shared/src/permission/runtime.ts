import { adminPermissionTree } from './tree.js';

import type {
  AdminPermissionKey,
  AdminPermissionNode,
  AdminPermissionRouteName,
} from './types.js';

/**
 * 遍历权限树节点。
 *
 * @param nodes 当前层级权限节点。
 * @param visitor 节点访问函数。
 * @returns void。
 */
export function walkAdminPermissionTree(
  nodes: readonly AdminPermissionNode[],
  visitor: (node: AdminPermissionNode) => void,
) {
  nodes.forEach((node) => {
    visitor(node);
    if (node.children?.length) {
      walkAdminPermissionTree(node.children, visitor);
    }
  });
}

/**
 * 从权限树收集所有权限 key。
 *
 * @returns 权限树中所有节点的 key。
 */
function collectPermissionKeys() {
  const keys: string[] = [];
  walkAdminPermissionTree(adminPermissionTree, (node) => {
    keys.push(node.key);
  });
  return keys;
}

/**
 * 从权限树收集页面权限与路由名的映射。
 *
 * @returns key 为权限 key，value 为 admin route name 的映射。
 */
function collectPageRouteMap() {
  const map: Partial<Record<AdminPermissionKey, AdminPermissionRouteName>> = {};
  walkAdminPermissionTree(adminPermissionTree, (node) => {
    if (node.route) {
      map[node.key as AdminPermissionKey] =
        node.route as AdminPermissionRouteName;
    }
  });
  return map;
}

/** admin 权限树中所有节点 key，不维护第二份权限常量。 */
export const adminPermissionKeys = collectPermissionKeys();

/** admin 权限 key 集合，用于快速校验前端提交和历史角色数据。 */
export const adminPermissionKeySet: ReadonlySet<string> = new Set(
  adminPermissionKeys,
);

/** admin 页面入口权限到路由名的映射，只包含权限树中带 route 的节点。 */
export const adminPermissionPageRouteMap = collectPageRouteMap();

/**
 * 声明一个 admin 权限 key。
 *
 * @param key 权限树中已经注册的权限 key。
 * @returns 传入的权限 key。
 * @throws 当 key 未注册到权限树时抛出错误，避免 routeHandler 写错字符串。
 */
export function adminPermissionKey<T extends AdminPermissionKey>(key: T): T {
  if (!isAdminPermissionKey(key)) {
    throw new Error(`Unknown admin permission key: ${key}`);
  }
  return key;
}

/**
 * 判断字符串是否是 admin 权限树中的 key。
 *
 * @param key 待校验的权限 key。
 * @returns 如果 key 存在于权限树则返回 true。
 */
export function isAdminPermissionKey(key: string): key is AdminPermissionKey {
  return adminPermissionKeySet.has(key);
}

/**
 * 判断权限集合是否直接包含某个 key。
 *
 * @param permissions 当前用户拥有的权限 key 集合。
 * @param key 需要判断的权限 key。
 * @returns 集合中存在目标 key 时返回 true。
 */
function includesAdminPermissionKey(
  permissions: ReadonlySet<string> | readonly string[],
  key: string,
) {
  return 'has' in permissions ? permissions.has(key) : permissions.includes(key);
}

/**
 * 规范化权限 key 列表，过滤未知 key 并保持首次出现顺序。
 *
 * @param keys 待清洗的权限 key 列表，允许为空。
 * @returns 去重后的有效 admin 权限 key 列表。
 */
export function normalizeAdminPermissionKeys(
  keys: readonly string[] | null | undefined,
): AdminPermissionKey[] {
  const result: AdminPermissionKey[] = [];
  const seen = new Set<string>();

  keys?.forEach((key) => {
    if (!seen.has(key) && isAdminPermissionKey(key)) {
      seen.add(key);
      result.push(key);
    }
  });

  return result;
}

/**
 * 从权限树收集每个节点的后代权限 key。
 *
 * @returns key 为权限 key，value 为该节点下所有后代权限 key。
 */
function collectPermissionDescendantMap() {
  const map: Partial<Record<AdminPermissionKey, AdminPermissionKey[]>> = {};

  const visit = (node: AdminPermissionNode): AdminPermissionKey[] => {
    const descendants: AdminPermissionKey[] = [];

    node.children?.forEach((child) => {
      if (isAdminPermissionKey(child.key)) {
        descendants.push(child.key);
      }
      descendants.push(...visit(child));
    });

    if (isAdminPermissionKey(node.key)) {
      map[node.key] = descendants;
    }

    return descendants;
  };

  adminPermissionTree.forEach(visit);
  return map;
}

/** admin 权限 key 的后代映射，用于页面节点通过子权限推导可访问性。 */
export const adminPermissionDescendantKeyMap = collectPermissionDescendantMap();

/**
 * 判断权限集合是否包含指定权限。
 *
 * @param permissions 当前用户拥有的权限 key 集合。
 * @param key 需要判断的权限 key。
 * @returns 权限集合包含目标 key，或包含目标 key 下任一后代权限时返回 true。
 */
export function hasAdminPermissionKey(
  permissions: ReadonlySet<string> | readonly string[],
  key: AdminPermissionKey,
) {
  if (includesAdminPermissionKey(permissions, key)) {
    return true;
  }

  return (adminPermissionDescendantKeyMap[key] ?? []).some((descendant) =>
    includesAdminPermissionKey(permissions, descendant),
  );
}

/**
 * 判断权限集合是否包含全部目标权限。
 *
 * @param permissions 当前用户拥有的权限 key 集合。
 * @param keys 需要全部满足的权限 key。
 * @returns 所有目标权限都存在时返回 true；空数组返回 true。
 */
export function hasAllPermissions(
  permissions: ReadonlySet<string> | readonly string[],
  keys: readonly AdminPermissionKey[],
) {
  return keys.every((key) => hasAdminPermissionKey(permissions, key));
}

/**
 * 判断权限集合是否包含任意目标权限。
 *
 * @param permissions 当前用户拥有的权限 key 集合。
 * @param keys 只需满足其中之一的权限 key。
 * @returns 任一目标权限存在时返回 true；空数组返回 false。
 */
export function hasAnyPermission(
  permissions: ReadonlySet<string> | readonly string[],
  keys: readonly AdminPermissionKey[],
) {
  return keys.some((key) => hasAdminPermissionKey(permissions, key));
}
