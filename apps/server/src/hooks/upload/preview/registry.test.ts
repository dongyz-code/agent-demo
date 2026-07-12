import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPreviewProvider } from './registry.js';
import { renderSafeTextPreview } from './text.js';

describe('文件预览选择与文本安全', () => {
  it('按可信 MIME 选择图片、文本、Office 和直接预览', () => {
    assert.equal(getPreviewProvider('image/png')?.name, 'sharp-thumbnail');
    assert.equal(getPreviewProvider('text/markdown')?.name, 'safe-text');
    assert.equal(
      getPreviewProvider(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )?.name,
      'libreoffice-worker',
    );
    assert.equal(getPreviewProvider('application/pdf')?.name, 'direct');
    assert.equal(getPreviewProvider('video/mp4')?.name, 'direct');
  });

  it('HTML、SVG 和未知类型不会选择同源预览器', () => {
    assert.equal(getPreviewProvider('text/html'), undefined);
    assert.equal(getPreviewProvider('image/svg+xml'), undefined);
    assert.equal(getPreviewProvider('application/x-unknown'), undefined);
  });

  it('Markdown 删除脚本和危险链接，纯文本执行 HTML 转义', async () => {
    const markdown = await renderSafeTextPreview(
      '# 标题\n<script>alert(1)</script>[危险](javascript:alert(1))',
      'text/markdown',
    );
    assert.equal(markdown.includes('<script'), false);
    assert.equal(/href=["']javascript:/i.test(markdown), false);
    const plain = await renderSafeTextPreview('<img src=x onerror=alert(1)>', 'text/plain');
    assert.equal(plain.includes('<img'), false);
    assert.match(plain, /&lt;img/);
  });
});
