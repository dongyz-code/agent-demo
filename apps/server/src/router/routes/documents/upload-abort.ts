import { eq } from 'drizzle-orm';

import { createDomainError } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import {
  abortMultipartUpload,
  canCancelUploadSession,
  getFileRow,
  getOwnedSession,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-abort',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const session = await getOwnedSession(body.sessionId, __token.user_id);
    if (['canceled', 'expired'].includes(session.status)) {
      return 'ok';
    }
    if (!canCancelUploadSession(session.status)) {
      throw createDomainError(
        'UPLOAD_SESSION_STATE_CONFLICT',
        '已完成上传不能取消',
        '数据异常',
      );
    }
    const file = await getFileRow(session.file_id);
    if (session.mode === 'multipart' && session.upload_id) {
      await abortMultipartUpload({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
      });
    }
    await db
      .update(schema.file_upload_sessions)
      .set({
        status: 'canceled',
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_upload_sessions.session_id, body.sessionId));
    return 'ok';
  },
});

export default api;
