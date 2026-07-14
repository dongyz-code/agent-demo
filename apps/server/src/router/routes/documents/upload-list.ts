import { and, desc, eq, inArray } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { toUploadSessionInfo } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-list',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const [start = 0, end = 20] = body.limit ?? [];
    const where = and(
      eq(schema.file_upload_sessions.create_user_id, __token.user_id),
      body.status?.length
        ? inArray(schema.file_upload_sessions.status, body.status)
        : undefined,
      body.policyKey?.length
        ? inArray(schema.file_upload_sessions.policy_key, body.policyKey)
        : undefined,
    );
    const [list, count] = await Promise.all([
      db
        .select()
        .from(schema.file_upload_sessions)
        .where(where)
        .orderBy(desc(schema.file_upload_sessions.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? countRows(schema.file_upload_sessions, where)
        : Promise.resolve(0),
    ]);
    return { list: list.map(toUploadSessionInfo), count };
  },
});

export default api;
