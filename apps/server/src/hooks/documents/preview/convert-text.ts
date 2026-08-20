/**
 * 文本类型预览页面转换。
 *
 * 用固定逻辑纸张把安全文本切分并渲染为 SVG，再编码为页面图。Markdown 先提取
 * 清洗后的可见文本，统一走文本分页逻辑。
 */

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';
import { NUL } from '@/utils/index.js';
import { getFileExtension } from '@repo/shared';
import { documentsConfig } from '../config.js';

import {
  encodePreviewPage,
  MAX_PAGE_COUNT,
  PREVIEW_PAGE_VARIANTS,
  PREVIEW_VARIANT_CONFIGS,
  readSourceBuffer,
} from './shared.js';

import type { ConvertedDocumentPage, DocumentPageSource } from './shared.js';
import type { DocumentPreviewPageVariant } from '@repo/types';

const TEXT_PAGE_WIDTH = 1_191;
const TEXT_PAGE_HEIGHT = 1_684;
const TEXT_MARGIN = 72;
const TEXT_FONT_SIZE = 28;
const TEXT_LINE_HEIGHT = 42;
const TEXT_LINE_LENGTH = 74;

/**
 * 使用固定逻辑纸张把安全文本切分，并依次输出两个页面层级。
 *
 * @param source 已验证文本源文件及其受控读取函数。
 * @returns 页码一致且 quick 在 clear 之前的页面异步序列。
 */
export async function* convertText(
  source: DocumentPageSource,
): AsyncGenerator<ConvertedDocumentPage> {
  const content = await readSourceBuffer(
    source,
    documentsConfig.upload.maxTextPreviewBytes,
  );
  const raw = content.toString('utf8').replaceAll(NUL, '');
  const safeText =
    getFileExtension(source.filename) === 'md'
      ? await markdownToSafeText(raw)
      : raw;
  const lines = wrapTextLines(safeText);
  const linesPerPage = Math.floor(
    (TEXT_PAGE_HEIGHT - TEXT_MARGIN * 2) / TEXT_LINE_HEIGHT,
  );
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));
  if (pageCount > MAX_PAGE_COUNT) {
    throw new ROOT_ERROR('文本预览页数超过上限', { limit: MAX_PAGE_COUNT });
  }
  for (const variant of PREVIEW_PAGE_VARIANTS) {
    for (let index = 0; index < pageCount; index++) {
      const pageLines = lines.slice(
        index * linesPerPage,
        (index + 1) * linesPerPage,
      );
      const config = PREVIEW_VARIANT_CONFIGS[variant];
      const width = Math.max(
        1,
        Math.round(TEXT_PAGE_WIDTH * config.textRenderScale),
      );
      const height = Math.max(
        1,
        Math.round(TEXT_PAGE_HEIGHT * config.textRenderScale),
      );
      const svg = renderTextPageSvg(pageLines, variant);
      const { content: pageContent, contentType } = await encodePreviewPage(
        sharp(Buffer.from(svg)),
        width,
        height,
        config.webpQuality,
      );
      yield {
        pageNumber: index + 1,
        variant,
        width,
        height,
        contentType,
        content: pageContent,
      };
    }
  }
}

/** Markdown 只提取经过清洗的可见文本，不保留脚本、链接或图片加载能力。 */
async function markdownToSafeText(source: string): Promise<string> {
  const html = await marked.parse(source, {
    async: false,
    gfm: true,
  });
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
    textFilter(text) {
      return text;
    },
  })
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

/** 按固定等宽列数换行，避免任何文本影响页面尺寸。 */
function wrapTextLines(source: string): string[] {
  const lines: string[] = [];
  for (const sourceLine of source.replaceAll('\r\n', '\n').split('\n')) {
    const characters = Array.from(sourceLine.replaceAll('\t', '    '));
    if (!characters.length) {
      lines.push('');
      continue;
    }
    for (let start = 0; start < characters.length; start += TEXT_LINE_LENGTH) {
      lines.push(characters.slice(start, start + TEXT_LINE_LENGTH).join(''));
    }
  }
  return lines.length ? lines : [''];
}

/**
 * 生成不包含外链、脚本或本地文件引用的指定层级纯 SVG 文本页。
 *
 * @param lines 当前逻辑纸张包含的安全文本行。
 * @param variant 控制 SVG 像素尺寸的页面层级。
 * @returns 可交给 Sharp 编码的自包含 SVG 字符串。
 */
function renderTextPageSvg(
  lines: string[],
  variant: DocumentPreviewPageVariant,
): string {
  const scale = PREVIEW_VARIANT_CONFIGS[variant].textRenderScale;
  const width = Math.max(1, Math.round(TEXT_PAGE_WIDTH * scale));
  const height = Math.max(1, Math.round(TEXT_PAGE_HEIGHT * scale));
  const margin = TEXT_MARGIN * scale;
  const fontSize = TEXT_FONT_SIZE * scale;
  const lineHeight = TEXT_LINE_HEIGHT * scale;
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="${margin}" y="${margin + fontSize + index * lineHeight}">${escapeXml(line || ' ')}</tspan>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text font-family="monospace" font-size="${fontSize}" fill="#111">${text}</text></svg>`;
}

/** 转义 SVG 文本节点，禁止输入形成标签或实体。 */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
