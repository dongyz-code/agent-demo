import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
} from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/user-log/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user-log'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const search = form?.search?.trim();
    const [timestampAfter, timestampBefore] = form?.timestamp ?? [];
    const userIds = form?.user_id;
    const keys = form?.key;
    const where = and(
      search ? ilike(schemas.user_logs.search_key, `%${search}%`) : undefined,
      timestampAfter
        ? gte(schemas.user_logs.timestamp, timestampAfter)
        : undefined,
      timestampBefore
        ? lte(schemas.user_logs.timestamp, timestampBefore)
        : undefined,
      userIds === undefined
        ? undefined
        : userIds === null
          ? isNull(schemas.user_logs.user_id)
          : Array.isArray(userIds)
            ? inArray(schemas.user_logs.user_id, userIds)
            : eq(schemas.user_logs.user_id, userIds),
      keys === undefined
        ? undefined
        : Array.isArray(keys)
          ? inArray(schemas.user_logs.key, keys)
          : eq(schemas.user_logs.key, keys),
      form?.ip ? eq(schemas.user_logs.ip, form.ip) : undefined,
    );

    const getList = async () => {
      const list = await db
        .select({
          id: schemas.user_logs.id,
          timestamp: schemas.user_logs.timestamp,
          user_id: schemas.user_logs.user_id,
          key: schemas.user_logs.key,
          ip: schemas.user_logs.ip,
          search_key: schemas.user_logs.search_key,
        })
        .from(schemas.user_logs)
        .where(where)
        .orderBy(desc(schemas.user_logs.timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list;
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return db.$count(schemas.user_logs, where);
    };

    const [list, count] = await Promise.all([getList(), getCount()]);

    return {
      count,
      list,
    };
  },
});

export default api;
