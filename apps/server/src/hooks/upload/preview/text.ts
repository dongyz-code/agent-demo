import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

import { getUploadRuntimeConfig } from '@/configs/index.js';
import { openStoredObject } from '../storage/commands.js';

import type { PreviewProvider } from './types.js';

const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv'];

/** 受控大小文本与 Markdown 的安全预览提供器。 */
export const textPreviewProvider: PreviewProvider = {
  name: 'safe-text',
  version: '1',
  supports(contentType) {
    return TEXT_TYPES.includes(contentType);
  },
  async getPreview(file) {
    const config = getUploadRuntimeConfig();
    if (file.size > config.maxTextPreviewBytes) {
      return unsupportedText('文本超过在线预览大小上限');
    }
    const stream = await openStoredObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
    });
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > config.maxTextPreviewBytes) {
        stream.destroy();
        return unsupportedText('文本超过在线预览大小上限');
      }
      chunks.push(buffer);
    }
    const source = Buffer.concat(chunks).toString('utf8');
    const text = await renderSafeTextPreview(source, file.contentType);
    return {
      mode: 'text',
      status: null,
      contentType: 'text/html; charset=utf-8',
      url: null,
      text,
      expiresAt: null,
      variantType: null,
      reason: null,
    };
  },
};

/** 将纯文本或 Markdown 转换为管理端可安全渲染的 HTML。 */
export async function renderSafeTextPreview(source: string, contentType: string) {
  return contentType === 'text/markdown'
    ? sanitizeHtml(await marked.parse(source), {
        allowedTags: sanitizeHtml.defaults.allowedTags.filter(
          (tag) => tag !== 'iframe',
        ),
        allowedAttributes: {
          a: ['href', 'title'],
          code: ['class'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
      })
    : escapeHtml(source);
}

/** 将纯文本转换为不会执行标记的 pre 内容。 */
function escapeHtml(value: string) {
  return `<pre>${value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')}</pre>`;
}

/** 返回文本预览安全降级结果。 */
function unsupportedText(reason: string) {
  return {
    mode: 'unsupported' as const,
    status: null,
    contentType: null,
    url: null,
    text: null,
    expiresAt: null,
    variantType: null,
    reason,
  };
}
