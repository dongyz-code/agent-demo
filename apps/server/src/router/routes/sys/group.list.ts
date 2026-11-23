import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';

import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.group'),
  handler: async ({ body }) => {
    const [start = 0, end = 20] = body.limit ?? [];
    const search = body.search?.trim();
    const where = buildWhere((filter) => {
      if (search) filter.push(ilike(schemas.user_group.name, `%${search}%`));
    });
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(schemas.user_group)
        .where(where)
        .orderBy(desc(schemas.user_group.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? db.select({ value: count() }).from(schemas.user_group).where(where)
        : Promise.resolve([]),
    ]);
    const ids = rows.map((row) => row.user_group_id);
    const [members, libraries] = await Promise.all([
      ids.length
        ? db
            .select({
              id: schemas.user_group_member.user_group_id,
              value: count(),
            })
            .from(schemas.user_group_member)
            .where(inArray(schemas.user_group_member.user_group_id, ids))
            .groupBy(schemas.user_group_member.user_group_id)
        : Promise.resolve([]),
      ids.length
        ? db
            .select({
              id: schemas.library_grants.subject_id,
              value: count(),
            })
            .from(schemas.library_grants)
            .where(
              and(
                eq(schemas.library_grants.subject_type, 'group'),
                inArray(schemas.library_grants.subject_id, ids),
              ),
            )
            .groupBy(schemas.library_grants.subject_id)
        : Promise.resolve([]),
    ]);
    const memberCount = new Map(members.map((row) => [row.id, row.value]));
    const libraryCount = new Map(libraries.map((row) => [row.id, row.value]));
    return {
      list: rows.map((row) => ({
        userGroupId: row.user_group_id,
        name: row.name,
        description: row.description,
        memberCount: memberCount.get(row.user_group_id) ?? 0,
        libraryCount: libraryCount.get(row.user_group_id) ?? 0,
      })),
      count: countRows[0]?.value ?? 0,
    };
  },
});

export default api;
