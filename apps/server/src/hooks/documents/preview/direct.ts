import { presignGetObject } from '../storage/presign.js';

import type { PreviewProvider } from './types.js';

const DIRECT_PREFIXES = ['image/', 'audio/', 'video/'];

/** 浏览器原生支持格式的直接预览提供器。 */
export const directPreviewProvider: PreviewProvider = {
  name: 'direct',
  version: '1',
  supports(contentType) {
    return (
      contentType === 'application/pdf' ||
      (contentType !== 'image/svg+xml' &&
        DIRECT_PREFIXES.some((prefix) => contentType.startsWith(prefix)))
    );
  },
  async getPreview(file) {
    const signed = await presignGetObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      contentType: file.contentType,
      filename: file.filename,
      disposition: 'inline',
    });
    return {
      mode: 'direct',
      status: null,
      contentType: file.contentType,
      url: signed.url,
      text: null,
      expiresAt: signed.expiresAt,
      variantType: null,
      reason: null,
    };
  },
};
