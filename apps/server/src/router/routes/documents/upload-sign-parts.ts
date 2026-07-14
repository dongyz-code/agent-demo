import { getUploadRuntimeConfig, ROOT_ERROR } from '@/configs/index.js';
import {
  assertActiveSession,
  getFileRow,
  getOwnedSession,
  presignUploadPart,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-sign-parts',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const session = await getOwnedSession(body.sessionId, __token.user_id);
    const config = getUploadRuntimeConfig();
    assertActiveSession(session);
    if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
      throw new ROOT_ERROR('非法参数', 'UPLOAD_PART_INVALID: 当前会话不是 Multipart');
    }
    const uniqueParts = [...new Set(body.partNumbers)];
    if (
      !uniqueParts.length ||
      uniqueParts.length > config.maxSignedParts ||
      uniqueParts.some(
        (partNumber) =>
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > session.part_count!,
      )
    ) {
      throw new ROOT_ERROR('非法参数', 'UPLOAD_PART_INVALID: 分片编号范围不合法');
    }
    const file = await getFileRow(session.file_id);
    const parts = await Promise.all(
      uniqueParts.map(async (partNumber) => {
        const signed = await presignUploadPart({
          bucket: file.bucket,
          objectKey: file.object_key,
          uploadId: session.upload_id!,
          partNumber,
        });
        return { partNumber, uploadUrl: signed.url, expiresAt: signed.expiresAt };
      }),
    );
    return { parts };
  },
});

export default api;
