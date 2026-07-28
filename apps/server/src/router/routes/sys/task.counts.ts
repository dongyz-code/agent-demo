import { db, schemas } from '@/database/index.js';
import { findFileProcessingTaskIds } from '@/hooks/documents/tasks/task-center.js';
import { routerHandler } from '@/router/utils.js';
import {
  and,
  count as countSql,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

import type { SQL } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/task/counts',
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
      if (!taskIds.length) return [];
      filters.push(inArray(schemas.tasks.task_id, taskIds));
    }

    const data = await db
      .select({ status: schemas.tasks.status, count: countSql() })
      .from(schemas.tasks)
      .where(and(...filters))
      .groupBy(schemas.tasks.status);
    return data.map(({ status, count }) => ({ count, status }));
  },
});

export default api;
