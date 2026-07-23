import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-list',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const [start = 0, end = 20] = body.limit ?? [];
    const where = and(
      eq(schemas.file_upload_sessions.create_user_id, __token.user_id),
      body.status?.length
        ? inArray(schemas.file_upload_sessions.status, body.status)
        : undefined,
      body.policyKey?.length
        ? inArray(schemas.file_upload_sessions.policy_key, body.policyKey)
        : undefined,
    );
    const [list, count] = await Promise.all([
      db
        .select({
          sessionId: schemas.file_upload_sessions.session_id,
          fileId: schemas.file_upload_sessions.file_id,
          policyKey: schemas.file_upload_sessions.policy_key,
          enterRag: schemas.file_upload_sessions.enter_rag,
          documentIntent: schemas.file_upload_sessions.document_intent,
          documentId: schemas.file_upload_sessions.document_id,
          documentName: schemas.file_upload_sessions.document_name,
          datasetIds: sql<string[]>`${schemas.file_upload_sessions.dataset_ids}::jsonb`,
          processingConfigVersion:
            schemas.file_upload_sessions.processing_config_version,
          mode: schemas.file_upload_sessions.mode,
          status: schemas.file_upload_sessions.status,
          filename: schemas.file_upload_sessions.filename,
          size: schemas.file_upload_sessions.size,
          partSize: schemas.file_upload_sessions.part_size,
          partCount: schemas.file_upload_sessions.part_count,
          uploadedSize: schemas.file_upload_sessions.uploaded_size,
          expiresAt: schemas.file_upload_sessions.expire_timestamp,
          errorCode: schemas.file_upload_sessions.error_code,
          errorMessage: schemas.file_upload_sessions.error_message,
        })
        .from(schemas.file_upload_sessions)
        .where(where)
        .orderBy(desc(schemas.file_upload_sessions.create_timestamp))
        .offset(start)
        .limit(Math.max(0, end - start)),
      body.withCount
        ? db.$count(schemas.file_upload_sessions, where)
        : Promise.resolve(0),
    ]);
    return { list, count };
  },
});

export default api;
