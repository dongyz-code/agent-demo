import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
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
        .select({
          sessionId: schema.file_upload_sessions.session_id,
          fileId: schema.file_upload_sessions.file_id,
          policyKey: schema.file_upload_sessions.policy_key,
          enterRag: schema.file_upload_sessions.enter_rag,
          documentIntent: schema.file_upload_sessions.document_intent,
          documentId: schema.file_upload_sessions.document_id,
          documentName: schema.file_upload_sessions.document_name,
          datasetIds: sql<string[]>`${schema.file_upload_sessions.dataset_ids}::jsonb`,
          processingConfigVersion:
            schema.file_upload_sessions.processing_config_version,
          mode: schema.file_upload_sessions.mode,
          status: schema.file_upload_sessions.status,
          filename: schema.file_upload_sessions.filename,
          size: schema.file_upload_sessions.size,
          partSize: schema.file_upload_sessions.part_size,
          partCount: schema.file_upload_sessions.part_count,
          uploadedSize: schema.file_upload_sessions.uploaded_size,
          expiresAt: schema.file_upload_sessions.expire_timestamp,
          errorCode: schema.file_upload_sessions.error_code,
          errorMessage: schema.file_upload_sessions.error_message,
        })
        .from(schema.file_upload_sessions)
        .where(where)
        .orderBy(desc(schema.file_upload_sessions.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? countRows(schema.file_upload_sessions, where)
        : Promise.resolve(0),
    ]);
    return { list, count };
  },
});

export default api;
