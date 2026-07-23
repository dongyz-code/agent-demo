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
  url: '/sys/api-log/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app-log'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const search = form?.search?.trim();
    const [startedAfter, startedBefore] = form?.start_timestamp ?? [];
    const userIds = form?.user_id;
    const statuses = form?.status as
      | NonNullable<(typeof schemas.api_logs.$inferSelect)['status']>
      | NonNullable<(typeof schemas.api_logs.$inferSelect)['status']>[]
      | undefined;
    const modes = form?.mode as
      | (typeof schemas.api_logs.$inferSelect)['mode']
      | (typeof schemas.api_logs.$inferSelect)['mode'][]
      | undefined;
    const clientIds = form?.client_id;
    const clientMarks = form?.client_mark;
    const where = and(
      search ? ilike(schemas.api_logs.search_key, `%${search}%`) : undefined,
      startedAfter
        ? gte(schemas.api_logs.start_timestamp, startedAfter)
        : undefined,
      startedBefore
        ? lte(schemas.api_logs.start_timestamp, startedBefore)
        : undefined,
      userIds === undefined
        ? undefined
        : userIds === null
          ? isNull(schemas.api_logs.user_id)
          : Array.isArray(userIds)
            ? inArray(schemas.api_logs.user_id, userIds)
            : eq(schemas.api_logs.user_id, userIds),
      form?.url ? eq(schemas.api_logs.url, form.url) : undefined,
      form?.ip ? eq(schemas.api_logs.ip, form.ip) : undefined,
      statuses === undefined
        ? undefined
        : Array.isArray(statuses)
          ? inArray(schemas.api_logs.status, statuses)
          : eq(schemas.api_logs.status, statuses),
      modes === undefined
        ? undefined
        : Array.isArray(modes)
          ? inArray(schemas.api_logs.mode, modes)
          : eq(schemas.api_logs.mode, modes),
      clientIds === undefined
        ? undefined
        : clientIds === null
          ? isNull(schemas.api_logs.client_id)
          : Array.isArray(clientIds)
            ? inArray(schemas.api_logs.client_id, clientIds)
            : eq(schemas.api_logs.client_id, clientIds),
      clientMarks === undefined
        ? undefined
        : clientMarks === null
          ? isNull(schemas.api_logs.client_mark)
          : Array.isArray(clientMarks)
            ? inArray(schemas.api_logs.client_mark, clientMarks)
            : eq(schemas.api_logs.client_mark, clientMarks),
    );

    const getList = async () => {
      const list = await db
        .select({
          id: schemas.api_logs.id,
          start_timestamp: schemas.api_logs.start_timestamp,
          end_timestamp: schemas.api_logs.end_timestamp,
          user_id: schemas.api_logs.user_id,
          url: schemas.api_logs.url,
          ip: schemas.api_logs.ip,
          search_key: schemas.api_logs.search_key,
          status: schemas.api_logs.status,
          mode: schemas.api_logs.mode,
          client_id: schemas.api_logs.client_id,
          duration: schemas.api_logs.duration,
          client_mark: schemas.api_logs.client_mark,
        })
        .from(schemas.api_logs)
        .where(where)
        .orderBy(desc(schemas.api_logs.start_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list;
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return db.$count(schemas.api_logs, where);
    };

    const [list, count] = await Promise.all([getList(), getCount()]);

    return {
      count,
      list,
    };
  },
});

export default api;
