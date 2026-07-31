import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { count as countSql, eq, gte, ilike, inArray, lte } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/counts',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) => {
    const form = body.form ?? {};
    const where = buildWhere((filter) => {
      if (form.status?.length) {
        if (Array.isArray(form.status)) {
          filter.push(inArray(schemas.tasks.status, form.status));
        } else {
          filter.push(eq(schemas.tasks.status, form.status));
        }
      }
      const search = form.search?.trim();
      if (search) {
        filter.push(ilike(schemas.tasks.search_key, `%${search}%`));
      }
      if (form.key?.length) {
        if (Array.isArray(form.key)) {
          filter.push(inArray(schemas.tasks.task_key, form.key));
        } else {
          filter.push(eq(schemas.tasks.task_key, form.key));
        }
      }
      if (form.trigger_method) {
        filter.push(eq(schemas.tasks.trigger_method, form.trigger_method));
      }
      if (form.current_stage?.length) {
        if (Array.isArray(form.current_stage)) {
          filter.push(inArray(schemas.tasks.current_stage, form.current_stage));
        } else {
          filter.push(eq(schemas.tasks.current_stage, form.current_stage));
        }
      }
      if (form.business_id) {
        filter.push(eq(schemas.tasks.business_id, form.business_id));
      }
      if (form.execution_user_id) {
        filter.push(
          eq(schemas.tasks.execution_user_id, form.execution_user_id),
        );
      }
      if (form.create_timestamp?.[0]) {
        filter.push(
          gte(schemas.tasks.create_timestamp, form.create_timestamp[0]),
        );
      }
      if (form.create_timestamp?.[1]) {
        filter.push(
          lte(schemas.tasks.create_timestamp, form.create_timestamp[1]),
        );
      }
    });
    const data = await db
      .select({ status: schemas.tasks.status, count: countSql() })
      .from(schemas.tasks)
      .where(where)
      .groupBy(schemas.tasks.status);
    return data.map(({ status, count }) => ({ count, status }));
  },
});

export default api;
