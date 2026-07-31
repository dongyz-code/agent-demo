import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import {
  count as countSql,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/list',
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
    const limit = body.limit ?? [0, 10];
    const listPromise = db
      .select({
        task_id: schemas.tasks.task_id,
        create_timestamp: schemas.tasks.create_timestamp,
        end_timestamp: schemas.tasks.end_timestamp,
        execution_user_id: schemas.tasks.execution_user_id,
        trigger_method: schemas.tasks.trigger_method,
        start_timestamp: schemas.tasks.start_timestamp,
        status: schemas.tasks.status,
        task_key: schemas.tasks.task_key,
        task_name: schemas.tasks.task_name,
        search_key: schemas.tasks.search_key,
        pending_uuid: schemas.tasks.pending_uuid,
        business_type: schemas.tasks.business_type,
        business_id: schemas.tasks.business_id,
        current_stage: schemas.tasks.current_stage,
        progress: schemas.tasks.progress,
        processed_items: schemas.tasks.processed_items,
        total_items: schemas.tasks.total_items,
        error_code: schemas.tasks.error_code,
        error_message: schemas.tasks.error_message,
        last_update_timestamp: schemas.tasks.last_update_timestamp,
      })
      .from(schemas.tasks)
      .where(where)
      .orderBy(desc(schemas.tasks.create_timestamp))
      .offset(limit[0])
      .limit(limit[1] - limit[0]);
    const countPromise = body.withCount
      ? db.select({ value: countSql() }).from(schemas.tasks).where(where)
      : Promise.resolve([]);
    const [list, countRows] = await Promise.all([listPromise, countPromise]);
    const count = countRows[0]?.value ?? 0;
    return {
      list,
      count,
    };
  },
});

export default api;
