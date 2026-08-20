/**
 * 文档页面预览主分发门面。
 *
 * 仅负责按文件类型把可信源文件分发给各类型转换模块：
 * - 图片 → convert-image
 * - 文本 → convert-text
 * - PDF → convert-pdf
 * - Office → office-to-pdf 先转 PDF，再走 convert-pdf
 *
 * 跨类型复用的接口、常量、编码与源读取下沉到 shared.ts；各类型模块单向依赖
 * shared，互不依赖，本文件依赖 shared 与各 convert-* 模块，无循环。
 */

import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';
import { collectMimes } from '@/utils/index.js';
import { convertImage } from './convert-image.js';
import { convertPdf, PDFJS_VERSION } from './convert-pdf.js';
import { convertText } from './convert-text.js';
import { convertOfficeToPdf } from './office-to-pdf.js';
import {
  MAX_SOURCE_BYTES,
  PREVIEW_PAGE_VARIANTS,
  readSourceBuffer,
} from './shared.js';

import type { ConvertedDocumentPage, DocumentPageSource } from './shared.js';

const IMAGE_TYPES: ReadonlySet<string> = new Set(collectMimes('image'));
const PDF_TYPES: ReadonlySet<string> = new Set(collectMimes('pdf'));
const OFFICE_TYPES: ReadonlySet<string> = new Set(
  collectMimes('word', 'ppt', 'excel'),
);
const TEXT_TYPES: ReadonlySet<string> = new Set(collectMimes('text'));

/** 当前页面转换器组合版本，规则或底层渲染器变化时必须递增。 */
export const DOCUMENT_PREVIEW_CONVERTER_VERSION = [
  'document-pages-v3-progressive',
  `pdfjs-${PDFJS_VERSION}`,
  `sharp-${sharp.versions.sharp}`,
  'office-pdf-v1',
].join(':');

/** 对外保留 shared 中的类型，避免外部直接引用 shared 造成路径耦合。 */
export type { ConvertedDocumentPage, DocumentPageSource };

/** 单一文档页面转换器接口。 */
export interface DocumentPageConverter {
  /** 转换器组合版本，用于区分页面集合。 */
  version: string;
  /** 判断是否支持服务端可信 MIME。 */
  supports: (contentType: string) => boolean;
  /** 按页码顺序流式生成完整 WebP 页面。 */
  convert: (
    source: DocumentPageSource,
  ) => AsyncGenerator<ConvertedDocumentPage>;
}

/** 判断上传策略允许的内容是否具备统一页面转换能力。 */
function supportsDocumentPagePreview(contentType: string): boolean {
  return (
    PDF_TYPES.has(contentType) ||
    IMAGE_TYPES.has(contentType) ||
    OFFICE_TYPES.has(contentType) ||
    TEXT_TYPES.has(contentType)
  );
}

/** PDF、Office、文本和图片共用的唯一页面转换器。 */
export const documentPageConverter: DocumentPageConverter = {
  version: DOCUMENT_PREVIEW_CONVERTER_VERSION,
  supports: supportsDocumentPagePreview,
  async *convert(source) {
    if (!supportsDocumentPagePreview(source.contentType)) {
      throw new ROOT_ERROR('当前文件类型不支持页面预览');
    }
    if (IMAGE_TYPES.has(source.contentType)) {
      const input = await readSourceBuffer(source, MAX_SOURCE_BYTES);
      for (const variant of PREVIEW_PAGE_VARIANTS) {
        yield await convertImage(input, variant);
      }
      return;
    }
    if (TEXT_TYPES.has(source.contentType)) {
      yield* convertText(source);
      return;
    }

    const pdf = PDF_TYPES.has(source.contentType)
      ? await readSourceBuffer(source, MAX_SOURCE_BYTES)
      : await convertOfficeToPdf(source);
    yield* convertPdf(pdf);
  },
};
