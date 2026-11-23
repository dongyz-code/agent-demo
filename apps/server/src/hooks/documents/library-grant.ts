import { randomUUID } from 'node:crypto';
import { eq, ilike, inArray, or } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { requireLibraryAccess } from './library-access.js';

import type { LibraryGrantInfo, LibraryGrantInput } from '@repo/types';

/**
 * 用完整名单替换资料库授权，并保留至少一个管理员。
 *
 * @param libraryId 资料库标识。
 * @param grants 期望保留的授权。
 * @param userId 当前管理员。
 * @returns 保存后的授权列表。
 */
export async function saveLibraryGrants(
  libraryId: string,
  grants: LibraryGrantInput[],
  userId: string,
): Promise<LibraryGrantInfo[]> {
  await requireLibraryAccess(libraryId, userId, 'manager', 'admin');
  const merged = new Map<string, LibraryGrantInput>();
  for (const grant of grants) {
    if (grant.subjectType !== 'user' && grant.subjectType !== 'group') {
      throw new ROOT_ERROR('非法参数');
    }
    if (grant.role !== 'user' && grant.role !== 'manager') {
      throw new ROOT_ERROR('非法参数');
    }
    const subjectId = grant.subjectId.trim();
    if (!subjectId) throw new ROOT_ERROR('非法参数');
    const key = `${grant.subjectType}:${subjectId}`;
    const current = merged.get(key);
    if (!current || grant.role === 'manager') {
      merged.set(key, {
        subjectType: grant.subjectType,
        subjectId,
        role: current?.role === 'manager' ? 'manager' : grant.role,
      });
    }
  }
  const nextGrants = [...merged.values()];
  if (!nextGrants.some((grant) => grant.role === 'manager')) {
    throw new ROOT_ERROR('认证: 权限不足');
  }
  // 内置系统管理员不存于用户表，但其显式授权仍需保留，不能参与普通用户存在性校验。
  const userIds = nextGrants
    .filter(
      (grant) =>
        grant.subjectType === 'user' &&
        grant.subjectId !== ROOT.SYS_ADMIN_USER_ID,
    )
    .map((grant) => grant.subjectId);
  const groupIds = nextGrants
    .filter((grant) => grant.subjectType === 'group')
    .map((grant) => grant.subjectId);
  const [users, groups] = await Promise.all([
    userIds.length
      ? db
          .select({ id: schemas.user.user_id })
          .from(schemas.user)
          .where(inArray(schemas.user.user_id, userIds))
      : Promise.resolve([]),
    groupIds.length
      ? db
          .select({ id: schemas.user_group.user_group_id })
          .from(schemas.user_group)
          .where(inArray(schemas.user_group.user_group_id, groupIds))
      : Promise.resolve([]),
  ]);
  if (users.length !== userIds.length || groups.length !== groupIds.length) {
    throw new ROOT_ERROR('非法参数');
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(schemas.library_grants)
      .where(eq(schemas.library_grants.library_id, libraryId));
    if (nextGrants.length) {
      await tx.insert(schemas.library_grants).values(
        nextGrants.map((grant) => ({
          library_grant_id: randomUUID(),
          library_id: libraryId,
          subject_type: grant.subjectType,
          subject_id: grant.subjectId,
          role: grant.role,
          create_user_id: userId,
          create_timestamp: now,
          last_update_user_id: userId,
          last_update_timestamp: now,
        })),
      );
    }
  });
  return await listLibraryGrants(libraryId);
}

/**
 * 读取资料库显式授权，并带上用户昵称或用户组名称。
 *
 * @param libraryId 资料库标识。
 * @returns 授权展示行。
 */
export async function listLibraryGrants(
  libraryId: string,
): Promise<LibraryGrantInfo[]> {
  const grants = await db
    .select()
    .from(schemas.library_grants)
    .where(eq(schemas.library_grants.library_id, libraryId));
  const userIds = grants
    .filter((grant) => grant.subject_type === 'user')
    .map((grant) => grant.subject_id);
  const groupIds = grants
    .filter((grant) => grant.subject_type === 'group')
    .map((grant) => grant.subject_id);
  const [users, groups] = await Promise.all([
    userIds.length
      ? db
          .select({
            id: schemas.user.user_id,
            name: schemas.user.nickname,
            username: schemas.user.username,
          })
          .from(schemas.user)
          .where(inArray(schemas.user.user_id, userIds))
      : Promise.resolve([]),
    groupIds.length
      ? db
          .select({
            id: schemas.user_group.user_group_id,
            name: schemas.user_group.name,
          })
          .from(schemas.user_group)
          .where(inArray(schemas.user_group.user_group_id, groupIds))
      : Promise.resolve([]),
  ]);
  const names = new Map([
    ...users.map(
      (item) =>
        [
          `user:${item.id}`,
          displaySubjectName(item.name, item.username),
        ] as const,
    ),
    ...groups.map(
      (item) =>
        [`group:${item.id}`, displaySubjectName(item.name, '')] as const,
    ),
  ]);
  return grants.map((grant) => ({
    libraryGrantId: grant.library_grant_id,
    subjectType: grant.subject_type,
    subjectId: grant.subject_id,
    subjectName: grantDisplayName(
      grant.subject_type,
      grant.subject_id,
      names.get(`${grant.subject_type}:${grant.subject_id}`),
    ),
    role: grant.role,
    createdBy: grant.create_user_id,
    createdAt: grant.create_timestamp,
  }));
}

/**
 * 按名称搜索可授权的用户或用户组。
 *
 * @param subjectType 用户或用户组。
 * @param search 名称关键词。
 * @returns 最多 20 条候选项。
 */
export async function searchLibrarySubjects(
  subjectType: 'user' | 'group',
  search?: string,
) {
  const keyword = search?.trim();
  if (subjectType === 'group') {
    return await db
      .select({
        id: schemas.user_group.user_group_id,
        name: schemas.user_group.name,
      })
      .from(schemas.user_group)
      .where(
        keyword ? ilike(schemas.user_group.name, `%${keyword}%`) : undefined,
      )
      .limit(20);
  }
  const admin = systemAdminSubject(keyword);
  const rows = await db
    .select({
      id: schemas.user.user_id,
      name: schemas.user.nickname,
      username: schemas.user.username,
    })
    .from(schemas.user)
    .where(
      keyword
        ? or(
            ilike(schemas.user.nickname, `%${keyword}%`),
            ilike(schemas.user.username, `%${keyword}%`),
          )
        : undefined,
    )
    .limit(20);
  return [
    ...admin,
    ...rows
      .filter((row) => row.id !== ROOT.SYS_ADMIN_USER_ID)
      .map((row) => ({
        id: row.id,
        name: displaySubjectName(row.name, row.username),
      })),
  ].slice(0, 20);
}

/** 内置管理员不在用户表里，按昵称、用户名或「系统管理员」参与搜索。 */
function systemAdminSubject(keyword?: string) {
  const nickname = ROOT.authorization.admin.nickname?.trim() ?? '';
  const username = ROOT.authorization.admin.username;
  const text = `${nickname} ${username} 系统管理员`.toLowerCase();
  if (keyword && !text.includes(keyword.toLowerCase())) return [];
  return [{ id: ROOT.SYS_ADMIN_USER_ID, name: '系统管理员' }];
}

/** 内置管理员不在用户表里，用配置里的昵称。 */
function grantDisplayName(
  subjectType: string,
  subjectId: string,
  lookedUp: string | undefined,
) {
  if (subjectType === 'user' && subjectId === ROOT.SYS_ADMIN_USER_ID) {
    return '系统管理员';
  }
  if (lookedUp) return displaySubjectName(lookedUp, '');
  return subjectId;
}

/** 昵称为空时用用户名，避免授权名单里出现空白对象。 */
function displaySubjectName(name: string, username: string) {
  const label = name.trim();
  if (label && label !== '-') return label;
  const account = username.trim();
  if (account) return account;
  return label;
}
