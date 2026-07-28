import { db, schemas } from '@/database/index.js';
import {
  enrichFileTaskList,
  findFileProcessingTaskIds,
} from '@/hooks/documents/tasks/task-center.js';
import { routerHandler } from '@/router/utils.js';
import {
  and,
  count as countSql,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

import type { SQL } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/task/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) => {
    const form = body.form ?? {};
    const filters: SQL[] = [];

    if (form.category?.length) {
      filters.push(
        Array.isArray(form.category)
          ? inArray(schemas.tasks.task_category, form.category)
          : eq(schemas.tasks.task_category, form.category),
      );
    }
    if (form.status?.length) {
      filters.push(
        Array.isArray(form.status)
          ? inArray(schemas.tasks.status, form.status)
          : eq(schemas.tasks.status, form.status),
      );
    }
    if (form.search?.trim()) {
      filters.push(
        ilike(schemas.tasks.search_key, `%${form.search.trim()}%`),
      );
    }
    if (form.key?.length) {
      filters.push(
        Array.isArray(form.key)
          ? inArray(schemas.tasks.task_key, form.key)
          : eq(schemas.tasks.task_key, form.key),
      );
    }
    if (form.trigger_method) {
      filters.push(eq(schemas.tasks.trigger_method, form.trigger_method));
    }
    if (form.current_stage?.length) {
      filters.push(
        Array.isArray(form.current_stage)
          ? inArray(schemas.tasks.current_stage, form.current_stage)
          : eq(schemas.tasks.current_stage, form.current_stage),
      );
    }
    if (form.business_id) {
      filters.push(eq(schemas.tasks.business_id, form.business_id));
    }
    if (form.execution_user_id) {
      filters.push(
        eq(schemas.tasks.execution_user_id, form.execution_user_id),
      );
    }
    if (form.create_timestamp?.[0]) {
      filters.push(
        gte(schemas.tasks.create_timestamp, form.create_timestamp[0]),
      );
    }
    if (form.create_timestamp?.[1]) {
      filters.push(
        lte(schemas.tasks.create_timestamp, form.create_timestamp[1]),
      );
    }

    if (form.file_name?.trim()) {
      const taskIds = await findFileProcessingTaskIds({
        file_name: form.file_name,
      });
      if (!taskIds.length) return { list: [], count: 0 };
      filters.push(inArray(schemas.tasks.task_id, taskIds));
    }

    const where = and(...filters);
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
        task_category: schemas.tasks.task_category,
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
      ? db
          .select({ value: countSql() })
          .from(schemas.tasks)
          .where(where)
      : Promise.resolve([]);
    const [list, countRows] = await Promise.all([listPromise, countPromise]);
    const count = countRows[0]?.value ?? 0;
    const enriched = list.length
      ? await enrichFileTaskList(list.map((task) => task.task_id))
      : new Map();
    return {
      list: list.map((task) => ({
        ...task,
        running: false,
        file_task: enriched.get(task.task_id) ?? null,
      })),
      count,
    };
  },
});

export default api;
