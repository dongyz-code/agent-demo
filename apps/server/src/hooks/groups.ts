import { randomUUID } from 'node:crypto';
import { and, count, eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';

import type { UserGroupInfo, UserGroupMemberInfo } from '@repo/types';

/**
 * 读取用户组、成员和仍被引用的资料库数量。
 *
 * @param userGroupId 用户组标识。
 * @returns 用户组详情。
 */
export async function getUserGroup(userGroupId: string): Promise<
  UserGroupInfo & { members: UserGroupMemberInfo[] }
> {
  const [group] = await db
    .select()
    .from(schemas.user_group)
    .where(eq(schemas.user_group.user_group_id, userGroupId))
    .limit(1);
  if (!group) throw new ROOT_ERROR('用户组不存在');
  const [members, libraries] = await Promise.all([
    db
      .select({
        userId: schemas.user.user_id,
        nickname: schemas.user.nickname,
      })
      .from(schemas.user_group_member)
      .innerJoin(
        schemas.user,
        eq(schemas.user.user_id, schemas.user_group_member.user_id),
      )
      .where(eq(schemas.user_group_member.user_group_id, userGroupId)),
    db
      .select({ value: count() })
      .from(schemas.library_grants)
      .where(
        and(
          eq(schemas.library_grants.subject_id, userGroupId),
          eq(schemas.library_grants.subject_type, 'group'),
        ),
      ),
  ]);
  return {
    userGroupId: group.user_group_id,
    name: group.name,
    description: group.description,
    memberCount: members.length,
    libraryCount: libraries[0]?.value ?? 0,
    members,
  };
}

/**
 * 替换用户组成员。
 *
 * @param userGroupId 用户组标识。
 * @param userIds 期望保留的用户。
 * @param actorUserId 当前操作者。
 * @returns 更新后的用户组。
 */
export async function saveUserGroupMembers(
  userGroupId: string,
  userIds: string[],
  actorUserId: string,
) {
  await getUserGroup(userGroupId);
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length) {
    const users = await db
      .select({ id: schemas.user.user_id })
      .from(schemas.user)
      .where(inArray(schemas.user.user_id, ids));
    if (users.length !== ids.length) throw new ROOT_ERROR('非法参数');
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(schemas.user_group_member)
      .where(eq(schemas.user_group_member.user_group_id, userGroupId));
    if (ids.length) {
      await tx.insert(schemas.user_group_member).values(
        ids.map((userId) => ({
          user_group_id: userGroupId,
          user_id: userId,
          create_user_id: actorUserId,
          create_timestamp: now,
        })),
      );
    }
  });
  return await getUserGroup(userGroupId);
}

/**
 * 删除用户组，并去掉资料库里引用该组的授权。
 *
 * @param userGroupId 用户组标识。
 * @returns 删除完成后结束。
 */
export async function deleteUserGroup(userGroupId: string) {
  const group = await getUserGroup(userGroupId);
  await db.transaction(async (tx) => {
    await tx
      .delete(schemas.library_grants)
      .where(
        and(
          eq(schemas.library_grants.subject_type, 'group'),
          eq(schemas.library_grants.subject_id, userGroupId),
        ),
      );
    await tx
      .delete(schemas.user_group_member)
      .where(eq(schemas.user_group_member.user_group_id, userGroupId));
    await tx
      .delete(schemas.user_group)
      .where(eq(schemas.user_group.user_group_id, userGroupId));
  });
  return group.libraryCount;
}
