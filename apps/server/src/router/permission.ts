import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import {
  hasAdminPermissionKey,
  isAdminPermissionKey,
  normalizeAdminPermissionKeys,
} from '@repo/shared/permission';

import type { AdminPermissionKey } from '@repo/shared/permission';
import type {
  AuthenticationContext,
  FastifyInstance,
  FastifyRequest,
} from '@repo/utils-node';
import type { TokenDataWithExp } from '@/types/index.js';

/** route config 中保存单接口 admin 权限 key 的字段名。 */
export const adminPermissionRouteConfigKey = 'adminPermission';

/** 单个接口绑定的唯一 admin 权限 key。 */
export type AdminPermissionRule = AdminPermissionKey;

/** 当前用户的权限上下文，供接口权限校验和登录返回权限列表使用。 */
export type AdminPermissionContext = {
  /** 当前用户 ID。 */
  user_id: string;
  /** 当前用户是否是系统管理员；系统管理员不依赖角色权限列表。 */
  sys_admin: boolean;
  /** 普通用户从启用角色聚合得到的有效权限集合。 */
  permissions: Set<AdminPermissionKey>;
};

/** 数据库存储的角色权限行，只包含序列化后的权限字段。 */
type StoredRolePermissionRow = {
  /** role.permission 字段，内容应为 JSON 字符串数组。 */
  permission: string | null;
};

/** 当前服务端权限 hook 读取的认证上下文类型。 */
type RouteAuth = AuthenticationContext<TokenDataWithExp>;

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
function collectAdminPermissions(
  rows: readonly StoredRolePermissionRow[],
): AdminPermissionKey[] {
  return normalizeAdminPermissionKeys(
    rows.flatMap(({ permission }) => parseStoredAdminPermissions(permission)),
  );
}

/**
 * 校验并规范化角色保存 payload 中的权限列表。
 *
 * @param permission 前端提交的权限列表，允许为空。
 * @returns 数据库存储前使用的有效权限列表；空列表返回 null。
 * @throws 当权限列表包含未知 key 时抛出非法参数错误。
 */
function validateRolePermissionPayload(
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
 * 读取当前用户权限上下文。
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
    .select({ role_id: schemas.user_role.role_id })
    .from(schemas.user_role)
    .where(eq(schemas.user_role.user_id, user_id));

  if (!userRoles.length) {
    return {
      user_id,
      sys_admin: false,
      permissions: new Set(),
    };
  }

  const enabledRows = await db
    .select({ permission: schemas.role.permission })
    .from(schemas.role)
    .where(
      and(
        inArray(
          schemas.role.role_id,
          userRoles.map((item) => item.role_id),
        ),
        eq(schemas.role.available, true),
      ),
    );

  return {
    user_id,
    sys_admin: false,
    permissions: new Set(collectAdminPermissions(enabledRows)),
  };
}

/**
 * 从 Fastify route config 中读取当前接口绑定的唯一权限 key。
 *
 * @param request 当前 Fastify 请求对象。
 * @returns routeHandler 声明的接口权限；未声明时返回 undefined。
 */
function getRouteAdminPermission(request: FastifyRequest) {
  const routeConfig = request.routeOptions.config as unknown as
    | Record<string, unknown>
    | undefined;
  return routeConfig?.[adminPermissionRouteConfigKey] as
    | AdminPermissionRule
    | undefined;
}

/**
 * 断言当前请求满足 routeHandler 声明的单个接口权限。
 *
 * @param request 当前 Fastify 请求对象。
 * @returns 未声明权限或权限校验通过时正常返回。
 * @throws 身份缺失时抛出认证失败，权限不足时抛出统一业务错误。
 */
export async function assertRouteAdminPermission(request: FastifyRequest) {
  const permission = getRouteAdminPermission(request);
  if (!permission) {
    return;
  }

  const auth = request.auth as RouteAuth | undefined;
  const userId = auth?.token?.user_id;
  if (!userId) {
    throw new ROOT_ERROR('认证: 身份校验失败');
  }

  const context = await getAdminPermissionContext(userId);
  if (
    !context.sys_admin &&
    !hasAdminPermissionKey(context.permissions, permission)
  ) {
    throw new ROOT_ERROR('认证: 权限不足');
  }
}

/**
 * 注册基于 routeHandler({ permission }) 的接口权限校验 hook。
 *
 * @param fastify 当前 Fastify 实例。
 * @returns void。
 */
export function installRouteAdminPermission(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request) => {
    await assertRouteAdminPermission(request);
  });
}
