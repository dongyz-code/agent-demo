import { getOwnedFileRow } from './file-service.js';
import { getPreviewProvider } from './preview/registry.js';

import type { UploadActor } from './types.js';

/** 返回权限受控的统一文件预览描述。 */
export async function getFilePreview(fileId: string, actor: UploadActor) {
  const file = await getOwnedFileRow(fileId, actor);
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
      actor,
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
}
