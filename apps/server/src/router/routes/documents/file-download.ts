import { ROOT_ERROR } from '@/configs/index.js';
import {
  getOwnedFileRow,
  presignGetObject,
  sanitizeUploadFilename,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-download',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) => {
    const file = await getOwnedFileRow(body.fileId, __token.user_id);
    if (file.status !== 'verified') {
      throw new ROOT_ERROR(
        '数据异常',
        'UPLOAD_FILE_REJECTED: 文件尚未通过验证',
      );
    }
    return await presignGetObject({
      bucket: file.bucket,
      objectKey: file.object_key,
      contentType: file.content_type ?? 'application/octet-stream',
      filename: sanitizeUploadFilename(file.filename),
      disposition: 'attachment',
    });
  },
});

export default api;
