import {
  adminPermissionKey,
  hasAllPermissions,
  hasAnyPermission,
  isAdminPermissionKey,
  normalizeAdminPermissionKeys,
} from '@repo/shared/permission';
import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import type { AdminPermissionKey } from '@repo/shared/permission';
import type { FastifyRequest } from '@repo/utils-node';
import type { AuthenticationContext } from '@repo/utils-node';
import type { TokenDataWithExp } from '@/types/index.js';

/** route config 中保存 admin 权限规则的字段名。 */
export const adminPermissionRouteConfigKey = 'adminPermission';

/** 当前服务端权限 hook 读取的认证上下文类型。 */
type RouteAuth = AuthenticationContext<TokenDataWithExp>;

/** 当前用户的 admin 权限上下文，供服务端接口做最终权限边界判断。 */
export type AdminPermissionContext = {
  /** 当前用户 ID。 */
  user_id: string;
  /** 当前用户是否是系统管理员。 */
  sys_admin: boolean;
  /** 普通用户从启用角色聚合得到的有效权限集合。 */
  permissions: Set<AdminPermissionKey>;
};

/** 数据库存储的角色权限行，只包含序列化后的权限字段。 */
export type StoredRolePermissionRow = {
  /** role.permission 字段，内容应为 JSON 字符串数组。 */
  permission: string | null;
};

/** 带启用状态的角色权限行，供纯函数聚合和本地类型验证覆盖角色禁用语义。 */
export type StoredRolePermissionStateRow = StoredRolePermissionRow & {
  /** 角色是否启用；禁用角色不得参与普通用户权限聚合。 */
  available: boolean;
};

/** 单个接口需要满足的权限表达式。 */
export type AdminPermissionRequirement =
  | AdminPermissionKey
  | readonly AdminPermissionKey[]
  | {
      /** 满足任意一个权限即可通过。 */
      anyOf: readonly AdminPermissionKey[];
    }
  | {
      /** 必须满足全部权限才可通过。 */
      allOf: readonly AdminPermissionKey[];
    }
  | null
  | undefined;

/** routeHandler 注册到 Fastify route config 的静态权限规则。 */
export type AdminPermissionRule = AdminPermissionRequirement;

/**
 * 判断权限表达式是否是多权限列表。
 *
 * @param value 待判断的权限表达式。
 * @returns 数组形式的权限表达式返回 true。
 */
function isAdminPermissionKeyList(
  value: AdminPermissionRequirement,
): value is readonly AdminPermissionKey[] {
  return Array.isArray(value);
}

/**
 * 解析数据库中保存的角色权限 JSON。
 *
 * @param permission role.permission 字段内容。
 * @returns 有效 admin 权限 key 列表；非法 JSON 或非数组值会返回空数组。
 */
export function parseStoredAdminPermissions(
  permission: string | null,
): AdminPermissionKey[] {
  if (!permission) {
    return [];
  }

  try {
    const parsed = JSON.parse(permission);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeAdminPermissionKeys(
      parsed.filter((key): key is string => typeof key === 'string'),
    );
  } catch {
    return [];
  }
}

/**
 * 从多条角色权限记录聚合当前用户权限。
 *
 * @param rows 数据库角色权限行。
 * @returns 去重后的有效 admin 权限 key 列表。
 */
export function collectAdminPermissions(
  rows: readonly StoredRolePermissionRow[],
): AdminPermissionKey[] {
  return normalizeAdminPermissionKeys(
    rows.flatMap(({ permission }) => parseStoredAdminPermissions(permission)),
  );
}

/**
 * 从启用角色记录中聚合有效权限。
 *
 * @param rows 带启用状态的角色权限记录。
 * @returns 仅启用角色贡献的去重有效 admin 权限 key。
 */
export function collectEnabledAdminPermissions(
  rows: readonly StoredRolePermissionStateRow[],
): AdminPermissionKey[] {
  return collectAdminPermissions(rows.filter((row) => row.available));
}

/**
 * 校验并规范化角色保存 payload 中的权限列表。
 *
 * @param permission 前端提交的权限列表，允许为空。
 * @returns 数据库存储前使用的有效权限列表；空列表返回 null。
 * @throws 当权限列表包含未知 key 时抛出非法参数错误。
 */
export function validateRolePermissionPayload(
  permission: readonly string[] | null | undefined,
): AdminPermissionKey[] | null {
  const source = permission ?? [];
  const invalid = source.filter((key) => !isAdminPermissionKey(key));

  if (invalid.length) {
    throw new ROOT_ERROR('非法参数', `未知权限: ${invalid.join(', ')}`);
  }

  const normalized = normalizeAdminPermissionKeys(source);
  return normalized.length ? normalized : null;
}

/**
 * 将角色权限 payload 转成数据库字段内容。
 *
 * @param permission 前端提交的权限列表。
 * @returns 可写入 role.permission 的 JSON 字符串；无权限时返回 null。
 */
export function stringifyRolePermissionPayload(
  permission: readonly string[] | null | undefined,
) {
  const normalized = validateRolePermissionPayload(permission);
  return normalized ? JSON.stringify(normalized) : null;
}

/**
 * 读取当前用户 admin 权限上下文。
 *
 * @param user_id 当前用户 ID。
 * @returns 系统管理员上下文或普通用户启用角色聚合后的权限上下文。
 */
export async function getAdminPermissionContext(
  user_id: string,
): Promise<AdminPermissionContext> {
  if (user_id === ROOT.SYS_ADMIN_USER_ID) {
    return {
      user_id,
      sys_admin: true,
      permissions: new Set(),
    };
  }

  const userRoles = await db
    .select({ role_id: schema.user_role.role_id })
    .from(schema.user_role)
    .where(eq(schema.user_role.user_id, user_id));

  if (!userRoles.length) {
    return {
      user_id,
      sys_admin: false,
      permissions: new Set(),
    };
  }

  const enabledRows = await db
    .select({ permission: schema.role.permission })
    .from(schema.role)
    .where(
      and(
        inArray(
          schema.role.role_id,
          userRoles.map((item) => item.role_id),
        ),
        eq(schema.role.available, true),
      ),
    );

  return {
    user_id,
    sys_admin: false,
    permissions: new Set(collectAdminPermissions(enabledRows)),
  };
}

/**
 * 断言权限上下文拥有全部指定权限。
 *
 * @param context 当前用户权限上下文。
 * @param keys 需要全部满足的权限 key。
 * @throws 权限不足时抛出统一 403 业务错误。
 */
function assertAdminPermissions(
  context: AdminPermissionContext,
  keys: AdminPermissionKey | readonly AdminPermissionKey[],
) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!context.sys_admin && !hasAllPermissions(context.permissions, list)) {
    throw new ROOT_ERROR('认证: 权限不足');
  }
}

/**
 * 断言权限上下文拥有任意一个指定权限。
 *
 * @param context 当前用户权限上下文。
 * @param keys 只需满足其中之一的权限 key。
 * @throws 权限不足时抛出统一 403 业务错误。
 */
function assertAnyAdminPermission(
  context: AdminPermissionContext,
  keys: readonly AdminPermissionKey[],
) {
  if (!context.sys_admin && !hasAnyPermission(context.permissions, keys)) {
    throw new ROOT_ERROR('认证: 权限不足');
  }
}

/**
 * 按权限表达式断言当前用户是否有权访问接口。
 *
 * @param context 当前用户权限上下文。
 * @param requirement route 上声明的权限表达式。
 * @throws 权限不足时抛出统一 403 业务错误。
 */
export function assertAdminPermissionRequirement(
  context: AdminPermissionContext,
  requirement: AdminPermissionRequirement,
) {
  if (!requirement) {
    return;
  }

  if (typeof requirement === 'string') {
    assertAdminPermissions(context, requirement);
    return;
  }

  if (isAdminPermissionKeyList(requirement)) {
    assertAdminPermissions(context, requirement);
    return;
  }

  if ('anyOf' in requirement) {
    assertAnyAdminPermission(context, requirement.anyOf);
    return;
  }

  assertAdminPermissions(context, requirement.allOf);
}

/**
 * 读取用户 admin 权限上下文并断言权限表达式。
 *
 * @param userId 当前用户 ID。
 * @param requirement 需要满足的权限表达式。
 * @returns 权限校验通过时正常返回。
 * @throws 权限不足时抛出统一 403 业务错误。
 */
export async function assertUserAdminPermission(
  userId: string,
  requirement: AdminPermissionRequirement,
) {
  const context = await getAdminPermissionContext(userId);
  assertAdminPermissionRequirement(context, requirement);
}

/**
 * 读取 routeHandler 写入 route config 的权限规则并执行断言。
 *
 * @param request 当前 Fastify 请求对象。
 * @returns 没有声明权限或权限校验通过时正常返回。
 * @throws 身份缺失时抛出 401，权限不足时抛出统一 403 业务错误。
 */
export async function assertRouteAdminPermission(request: FastifyRequest) {
  const routeConfig = request.routeOptions.config as unknown as
    | Record<string, unknown>
    | undefined;
  const rule = routeConfig?.[adminPermissionRouteConfigKey] as
    | AdminPermissionRule
    | undefined;

  if (!rule) {
    return;
  }

  const auth = request.auth as RouteAuth | undefined;
  const userId = auth?.token?.user_id;
  if (!userId) {
    throw new ROOT_ERROR('认证: 身份校验失败');
  }

  await assertUserAdminPermission(userId, rule);
}

/**
 * 根据角色更新字段推导必须满足的角色管理权限。
 *
 * @param form 角色更新表单。
 * @returns 本次更新必须全部满足的权限 key 列表。
 */
export function listRoleUpdatePermissionRequirements(form: {
  /** 角色名称，出现时表示修改基础信息。 */
  name?: unknown;
  /** 角色描述，出现时表示修改基础信息。 */
  desc?: unknown;
  /** 角色启用状态，出现时表示启停角色。 */
  available?: unknown;
  /** 角色授权列表，出现时表示修改授权。 */
  permission?: unknown;
}) {
  const required: AdminPermissionKey[] = [];

  if ('name' in form || 'desc' in form) {
    required.push(adminPermissionKey('actions.role.update'));
  }
  if ('permission' in form) {
    required.push(adminPermissionKey('actions.role.assign-permission'));
  }
  if ('available' in form) {
    required.push(adminPermissionKey('actions.role.toggle'));
  }

  return required;
}

/**
 * 根据用户更新字段推导必须满足的用户管理权限。
 *
 * @param form 用户更新表单。
 * @returns 本次更新必须全部满足的权限 key 列表。
 */
export function listUserUpdatePermissionRequirements(form: {
  /** 用户昵称，出现时表示修改基础信息。 */
  nickname?: unknown;
  /** 用户邮箱，出现时表示修改基础信息。 */
  email?: unknown;
  /** 用户密码，出现时表示修改登录凭证。 */
  password?: unknown;
  /** 用户启用状态，出现时表示启停用户。 */
  available?: unknown;
  /** 用户角色列表，出现时表示分配角色。 */
  role_id?: unknown;
}) {
  const required: AdminPermissionKey[] = [];

  if ('nickname' in form || 'email' in form || 'password' in form) {
    required.push(adminPermissionKey('actions.user.update'));
  }
  if ('role_id' in form) {
    required.push(adminPermissionKey('actions.user.assign-role'));
  }
  if ('available' in form) {
    required.push(adminPermissionKey('actions.user.toggle'));
  }

  return required;
}

/**
 * 根据接口应用更新字段推导必须满足的接口管理权限。
 *
 * @param update 接口应用更新表单或刷新密钥动作。
 * @returns 本次更新必须全部满足的权限 key 列表。
 */
export function listAppUpdatePermissionRequirements(
  update:
    | 'refresh-secret'
    | {
        /** 接口应用名称，出现时表示修改基础信息。 */
        name?: unknown;
        /** 接口应用描述，出现时表示修改基础信息。 */
        desc?: unknown;
        /** 接口应用启用状态，出现时表示启停接口。 */
        available?: unknown;
      },
) {
  if (update === 'refresh-secret') {
    return [adminPermissionKey('actions.app.refresh-secret')];
  }

  const required: AdminPermissionKey[] = [];

  if ('name' in update || 'desc' in update) {
    required.push(adminPermissionKey('actions.app.update'));
  }
  if ('available' in update) {
    required.push(adminPermissionKey('actions.app.toggle'));
  }

  return required;
}
