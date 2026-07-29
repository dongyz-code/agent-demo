import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { desc, eq, gte, ilike, inArray, isNull, lte } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/user-log/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user-log'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const search = form?.search?.trim();
    const [timestampAfter, timestampBefore] = form?.timestamp ?? [];
    const userIds = form?.user_id;
    const keys = form?.key;
    const where = buildWhere((filter) => {
      if (search) {
        filter.push(ilike(schemas.user_logs.search_key, `%${search}%`));
      }
      if (timestampAfter) {
        filter.push(gte(schemas.user_logs.timestamp, timestampAfter));
      }
      if (timestampBefore) {
        filter.push(lte(schemas.user_logs.timestamp, timestampBefore));
      }
      if (userIds === null) {
        filter.push(isNull(schemas.user_logs.user_id));
      } else if (Array.isArray(userIds)) {
        filter.push(inArray(schemas.user_logs.user_id, userIds));
      } else if (userIds !== undefined) {
        filter.push(eq(schemas.user_logs.user_id, userIds));
      }
      if (Array.isArray(keys)) {
        filter.push(inArray(schemas.user_logs.key, keys));
      } else if (keys !== undefined) {
        filter.push(eq(schemas.user_logs.key, keys));
      }
      if (form?.ip) {
        filter.push(eq(schemas.user_logs.ip, form.ip));
      }
    });

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
