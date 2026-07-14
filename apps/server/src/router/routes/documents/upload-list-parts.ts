import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import {
  assertActiveSession,
  getFileRow,
  getOwnedSession,
  listMultipartParts,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-list-parts',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const session = await getOwnedSession(body.sessionId, __token.user_id);
    assertActiveSession(session);
    if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
      return { parts: [], uploadedSize: 0, missingPartNumbers: [] };
    }
    const file = await getFileRow(session.file_id);
    const parts = await listMultipartParts({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
    });
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const part of parts) {
        await tx
          .insert(schema.file_upload_parts)
          .values({
            part_id: randomUUID(),
            session_id: session.session_id,
            part_number: part.partNumber,
            etag: part.etag,
            size: part.size,
            completed_timestamp: now,
          })
          .onConflictDoUpdate({
            target: [
              schema.file_upload_parts.session_id,
              schema.file_upload_parts.part_number,
            ],
            set: {
              etag: part.etag,
              size: part.size,
              completed_timestamp: now,
            },
          });
      }
      await tx
        .update(schema.file_upload_sessions)
        .set({
          status: session.status === 'initialized' ? 'uploading' : session.status,
          uploaded_size: parts.reduce((sum, part) => sum + part.size, 0),
          last_update_user_id: __token.user_id,
          last_update_timestamp: now,
        })
        .where(eq(schema.file_upload_sessions.session_id, session.session_id));
    });
    const uploaded = new Set(parts.map((part) => part.partNumber));
    return {
      parts,
      uploadedSize: parts.reduce((sum, part) => sum + part.size, 0),
      missingPartNumbers: Array.from(
        { length: session.part_count },
        (_, index) => index + 1,
      ).filter((partNumber) => !uploaded.has(partNumber)),
    };
  },
});

export default api;
