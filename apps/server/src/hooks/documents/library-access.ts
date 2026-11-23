import { and, eq, inArray, sql } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';

import type { DbTransaction } from '@/database/index.js';
import type { LibraryGrantRole, LibraryRole } from '@repo/types';

/** 资料库判定使用的数据库或事务。 */
type LibraryReader = Pick<typeof db, 'select'>;

/** 管理端可以查看归档库；客户端检索只使用未归档库。 */
export type LibraryAccessMode = 'admin' | 'use';

/** 当前用户对一个资料库的有效身份和库状态。 */
export interface ResolvedLibraryAccess {
  /** 资料库标识。 */
  libraryId: string;
  /** 资料库名称。 */
  name: string;
  /** 资料库可见性。 */
  visibility: 'restricted' | 'published';
  /** 资料库状态。 */
  status: 'active' | 'archived';
  /** 有效身份。 */
  role: LibraryRole;
}

/**
 * 构造用户直接授权和用户组授权的匹配条件。
 *
 * @param userId 当前用户。
 * @returns 可放进 library_grants 别名 g 的 SQL 条件。
 */
function grantSubjectMatch(userId: string) {
  return sql`(
    (g.subject_type = 'user' and g.subject_id = ${userId})
    or (
      g.subject_type = 'group'
      and g.subject_id in (
        select user_group_id from user_group_member where user_id = ${userId}
      )
    )
  )`;
}

/**
 * 计算用户对一个资料库的有效身份。
 *
 * 系统管理员是全部库的管理员。全员可使用只把登录用户抬到使用者。
 * 归档库在客户端没有使用资格，管理端只保留管理员。
 *
 * @param libraryId 资料库标识。
 * @param userId 当前用户。
 * @param mode 管理端查看或客户端使用。
 * @param executor 调用方数据库或事务。
 * @returns 有资格时返回库和身份；否则返回空。
 */
export async function resolveLibraryAccess(
  libraryId: string,
  userId: string,
  mode: LibraryAccessMode,
  executor: LibraryReader = db,
): Promise<ResolvedLibraryAccess | null> {
  const [library] = await executor
    .select({
      libraryId: schemas.libraries.library_id,
      name: schemas.libraries.name,
      visibility: schemas.libraries.visibility,
      status: schemas.libraries.status,
    })
    .from(schemas.libraries)
    .where(eq(schemas.libraries.library_id, libraryId))
    .limit(1);
  if (!library) return null;
  if (userId === ROOT.SYS_ADMIN_USER_ID) {
    if (mode === 'use' && library.status !== 'active') return null;
    return { ...library, role: 'manager' };
  }
  const [grant] = await executor
    .select({
      role: sql<LibraryGrantRole | null>`
        case
          when bool_or(${schemas.library_grants.role} = 'manager') then 'manager'
          when bool_or(${schemas.library_grants.role} = 'user') then 'user'
          else null
        end
      `.as('role'),
    })
    .from(schemas.library_grants)
    .where(
      and(
        eq(schemas.library_grants.library_id, libraryId),
        sql`(
          (${schemas.library_grants.subject_type} = 'user' and ${schemas.library_grants.subject_id} = ${userId})
          or (
            ${schemas.library_grants.subject_type} = 'group'
            and ${schemas.library_grants.subject_id} in (
              select user_group_id from user_group_member where user_id = ${userId}
            )
          )
        )`,
      ),
    );
  let role = grant?.role ?? null;
  if (
    !role &&
    library.visibility === 'published' &&
    library.status === 'active'
  ) {
    role = 'user';
  }
  if (!role) return null;
  if (library.status === 'archived') {
    if (mode === 'use' || role !== 'manager') return null;
  }
  return { ...library, role };
}

/**
 * 要求用户具备资料库身份。看不见的库返回不存在，身份不够返回权限不足。
 *
 * @param libraryId 资料库标识。
 * @param userId 当前用户。
 * @param minimum 需要的最低身份。
 * @param mode 管理端查看或客户端使用。
 * @param executor 调用方数据库或事务。
 * @returns 通过判定的库和身份。
 */
export async function requireLibraryAccess(
  libraryId: string,
  userId: string,
  minimum: LibraryRole,
  mode: LibraryAccessMode,
  executor: LibraryReader = db,
): Promise<ResolvedLibraryAccess> {
  const access = await resolveLibraryAccess(libraryId, userId, mode, executor);
  if (!access) throw new ROOT_ERROR('资料库不存在');
  if (minimum === 'manager' && access.role !== 'manager') {
    throw new ROOT_ERROR('认证: 权限不足');
  }
  return access;
}

/**
 * 列出用户可以检索的未归档资料库。
 *
 * @param userId 当前用户。
 * @param executor 调用方数据库或事务。
 * @returns 资料库标识和名称。
 */
export async function listUsableLibraries(
  userId: string,
  executor: LibraryReader = db,
) {
  if (userId === ROOT.SYS_ADMIN_USER_ID) {
    return await executor
      .select({
        libraryId: schemas.libraries.library_id,
        name: schemas.libraries.name,
      })
      .from(schemas.libraries)
      .where(eq(schemas.libraries.status, 'active'));
  }
  return await executor
    .select({
      libraryId: schemas.libraries.library_id,
      name: schemas.libraries.name,
    })
    .from(schemas.libraries)
    .where(
      and(
        eq(schemas.libraries.status, 'active'),
        sql`(
          ${schemas.libraries.visibility} = 'published'
          or exists (
            select 1 from library_grants g
            where g.library_id = ${schemas.libraries.library_id}
              and ${grantSubjectMatch(userId)}
          )
        )`,
      ),
    );
}

/**
 * 管理端资料库列表的可见条件。归档库只对管理员和系统管理员可见。
 *
 * @param userId 当前用户。
 * @returns 可放进 libraries 查询的条件；系统管理员不受限制。
 */
export function libraryAdminListWhere(userId: string) {
  if (userId === ROOT.SYS_ADMIN_USER_ID) return undefined;
  return sql`(
    exists (
      select 1 from library_grants g
      where g.library_id = ${schemas.libraries.library_id}
        and g.role = 'manager'
        and ${grantSubjectMatch(userId)}
    )
    or (
      ${schemas.libraries.status} = 'active'
      and (
        ${schemas.libraries.visibility} = 'published'
        or exists (
          select 1 from library_grants g
          where g.library_id = ${schemas.libraries.library_id}
            and ${grantSubjectMatch(userId)}
        )
      )
    )
  )`;
}

/**
 * 文档阅读条件：管理员可读归档库中的文档，使用者只能读未归档库。
 *
 * @param userId 当前用户。
 * @returns 可放进 documents 查询的存在条件；系统管理员不受限制。
 */
export function documentLibraryReadExists(userId: string) {
  if (userId === ROOT.SYS_ADMIN_USER_ID) return undefined;
  return sql`exists (
    select 1 from libraries l
    where l.library_id = ${schemas.documents.library_id}
      and (
        exists (
          select 1 from library_grants g
          where g.library_id = l.library_id
            and g.role = 'manager'
            and ${grantSubjectMatch(userId)}
        )
        or (
          l.status = 'active'
          and (
            l.visibility = 'published'
            or exists (
              select 1 from library_grants g
              where g.library_id = l.library_id
                and ${grantSubjectMatch(userId)}
            )
          )
        )
      )
  )`;
}

/**
 * 文档维护条件：只有资料库管理员可以上传、删除、换版和移动。
 *
 * @param userId 当前用户。
 * @returns 可放进 documents 查询的存在条件；系统管理员不受限制。
 */
export function documentLibraryManageExists(userId: string) {
  if (userId === ROOT.SYS_ADMIN_USER_ID) return undefined;
  return sql`exists (
    select 1 from library_grants g
    where g.library_id = ${schemas.documents.library_id}
      and g.role = 'manager'
      and ${grantSubjectMatch(userId)}
  )`;
}

/**
 * 收集问答可以使用的已索引版本。
 *
 * @param userId 当前用户。
 * @param libraryId 会话限定的资料库；为空时使用全部可检索库。
 * @returns 版本标识，以及限定库已失效时的清空标记。
 */
export async function listIndexedVersionIds(
  userId: string,
  libraryId?: string | null,
): Promise<{ versionIds: string[]; scopeCleared: boolean }> {
  const usable = await listUsableLibraries(userId);
  const usableIds = new Set(usable.map((library) => library.libraryId));
  let libraryIds = [...usableIds];
  let scopeCleared = false;
  if (libraryId) {
    if (!usableIds.has(libraryId)) {
      scopeCleared = true;
      libraryIds = [];
    } else {
      libraryIds = [libraryId];
    }
  }
  if (!libraryIds.length) return { versionIds: [], scopeCleared };
  const rows = await db
    .select({
      versionId: schemas.documents.indexed_version_id,
    })
    .from(schemas.documents)
    .where(
      and(
        inArray(schemas.documents.library_id, libraryIds),
        eq(schemas.documents.status, 'active'),
        sql`${schemas.documents.indexed_version_id} is not null`,
      ),
    );
  return {
    versionIds: rows.flatMap((row) =>
      row.versionId ? [row.versionId] : [],
    ),
    scopeCleared,
  };
}

/**
 * 收集用户仍可打开的文档标识，用于引用复检。
 *
 * @param userId 当前用户。
 * @param documentIds 待检查的文档标识。
 * @returns 仍然可读的文档标识。
 */
export async function filterReadableDocumentIds(
  userId: string,
  documentIds: string[],
) {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length) return new Set<string>();
  const where = [inArray(schemas.documents.document_id, ids)];
  const readExists = documentLibraryReadExists(userId);
  if (readExists) where.push(readExists);
  where.push(sql`${schemas.documents.status} <> 'deleted'`);
  const rows = await db
    .select({ id: schemas.documents.document_id })
    .from(schemas.documents)
    .where(and(...where));
  return new Set(rows.map((row) => row.id));
}

export type { DbTransaction };
