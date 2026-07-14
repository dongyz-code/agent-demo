import {
  getOwnedFileRow,
  getPreviewProvider,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-preview',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) => {
    const file = await getOwnedFileRow(body.fileId, __token.user_id);
    if (file.status !== 'verified' || !file.content_type || !file.sha256) {
      return {
        mode: 'pending' as const,
        status: null,
        contentType: null,
        url: null,
        text: null,
        expiresAt: null,
        variantType: null,
        reason: '文件尚未完成严格验证',
      };
    }
    if (['text/html', 'image/svg+xml'].includes(file.content_type)) {
      return {
        mode: 'unsupported' as const,
        status: null,
        contentType: null,
        url: null,
        text: null,
        expiresAt: null,
        variantType: null,
        reason: '该主动内容类型不允许在应用同源环境直接预览',
      };
    }
    const provider = getPreviewProvider(file.content_type);
    if (!provider) {
      return {
        mode: 'unsupported' as const,
        status: null,
        contentType: null,
        url: null,
        text: null,
        expiresAt: null,
        variantType: null,
        reason: '当前文件类型没有可用预览器',
      };
    }
    try {
      return await provider.getPreview(
        {
          fileId: file.file_id,
          filename: file.filename,
          contentType: file.content_type,
          size: file.size,
          sha256: file.sha256,
          bucket: file.bucket,
          objectKey: file.object_key,
        },
        __token.user_id,
      );
    } catch (error) {
      return {
        mode: 'failed' as const,
        status: 'failed' as const,
        contentType: null,
        url: null,
        text: null,
        expiresAt: null,
        variantType: null,
        reason: error instanceof Error ? error.message : '文件预览失败',
      };
    }
  },
});

export default api;
