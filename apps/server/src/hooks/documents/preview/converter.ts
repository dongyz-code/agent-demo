import { DOMMatrix, ImageData, Path2D, createCanvas } from '@napi-rs/canvas';
import axios from 'axios';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

import { documentsConfig } from '../config.js';
import { presignGetObject } from '../storage/presign.js';

import type { Readable } from 'node:stream';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OFFICE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv']);
const PDF_TYPE = 'application/pdf';
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const MAX_PAGE_COUNT = 1_000;
const MAX_PAGE_PIXELS = 24_000_000;
const TEXT_PAGE_WIDTH = 1_191;
const TEXT_PAGE_HEIGHT = 1_684;
const TEXT_MARGIN = 72;
const TEXT_FONT_SIZE = 28;
const TEXT_LINE_HEIGHT = 42;
const TEXT_LINE_LENGTH = 74;

/** 当前页面转换器组合版本，规则或底层渲染器变化时必须递增。 */
export const DOCUMENT_PREVIEW_CONVERTER_VERSION = [
  'document-pages-v1',
  `pdfjs-${pdfjs.version}`,
  `sharp-${sharp.versions.sharp}`,
  'office-pdf-v1',
].join(':');

/** 页面转换器接收的可信源文件。 */
export interface DocumentPageSource {
  /** 用户上传时的文件名。 */
  filename: string;
  /** 服务端验证后的 MIME。 */
  contentType: string;
  /** 源文件字节数。 */
  size: number;
  /** 私有对象 Bucket。 */
  bucket: string;
  /** 私有对象路径。 */
  objectKey: string;
  /** 每次调用均返回一个新的源对象读取流。 */
  open: () => Promise<Readable>;
}

/** 转换完成但尚未发布的单页 WebP。 */
export interface ConvertedDocumentPage {
  /** 从 1 开始且连续的页码。 */
  pageNumber: number;
  /** 页面图片像素宽度。 */
  width: number;
  /** 页面图片像素高度。 */
  height: number;
  /** 固定为 WebP 的可信 MIME。 */
  contentType: 'image/webp';
  /** 待上传的完整页面内容。 */
  content: Buffer;
}

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
    contentType === PDF_TYPE ||
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
      throw new Error(
        'DOCUMENT_PREVIEW_TYPE_UNSUPPORTED: 当前文件类型不支持页面预览',
      );
    }
    if (IMAGE_TYPES.has(source.contentType)) {
      yield await convertImage(source);
      return;
    }
    if (TEXT_TYPES.has(source.contentType)) {
      yield* convertText(source);
      return;
    }

    const pdf =
      source.contentType === PDF_TYPE
        ? await readSourceBuffer(source, MAX_SOURCE_BYTES)
        : await convertOfficeToPdf(source);
    yield* convertPdf(pdf);
  },
};

/** 将图片校正方向并规范化为单页 WebP。 */
async function convertImage(
  source: DocumentPageSource,
): Promise<ConvertedDocumentPage> {
  const input = await readSourceBuffer(source, MAX_SOURCE_BYTES);
  const content = await sharp(input)
    .rotate()
    .resize({
      width: 2_400,
      height: 2_400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 84 })
    .toBuffer();
  const metadata = await sharp(content).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(
      'DOCUMENT_PREVIEW_IMAGE_INVALID: 无法读取转换后页面尺寸',
    );
  }
  return {
    pageNumber: 1,
    width: metadata.width,
    height: metadata.height,
    contentType: 'image/webp',
    content,
  };
}

/** 将 PDF 逐页渲染并规范化为 WebP。 */
async function* convertPdf(
  content: Buffer,
): AsyncGenerator<ConvertedDocumentPage> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(content),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages < 1 || document.numPages > MAX_PAGE_COUNT) {
      throw new Error(
        `DOCUMENT_PREVIEW_PAGE_LIMIT: PDF 页数必须在 1 到 ${MAX_PAGE_COUNT} 之间`,
      );
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const baseViewport = page.getViewport({ scale: 1.5 });
        const pixelScale = Math.min(
          1,
          Math.sqrt(
            MAX_PAGE_PIXELS / (baseViewport.width * baseViewport.height),
          ),
        );
        const viewport = page.getViewport({ scale: 1.5 * pixelScale });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        await page.render({
          canvas: canvas as never,
          canvasContext: context as never,
          viewport,
        }).promise;
        const pageContent = await sharp(canvas.toBuffer('image/png'))
          .webp({ quality: 84 })
          .toBuffer();
        yield {
          pageNumber,
          width,
          height,
          contentType: 'image/webp',
          content: pageContent,
        };
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.destroy();
  }
}

/** 通过受控 Worker 把 Office 文件转换为 PDF。 */
async function convertOfficeToPdf(source: DocumentPageSource): Promise<Buffer> {
  const endpoint = documentsConfig.upload.officePreviewEndpoint;
  if (!endpoint) {
    throw new Error(
      'DOCUMENT_PREVIEW_OFFICE_WORKER_MISSING: 未配置 Office 转换 Worker',
    );
  }
  const signed = await presignGetObject({
    bucket: source.bucket,
    objectKey: source.objectKey,
    contentType: source.contentType,
    filename: source.filename,
    disposition: 'attachment',
  });
  const response = await axios.post<ArrayBuffer>(
    endpoint,
    { sourceUrl: signed.url, filename: source.filename, target: 'pdf' },
    {
      responseType: 'arraybuffer',
      timeout: documentsConfig.document.parserTimeoutMs,
      maxContentLength: MAX_SOURCE_BYTES,
      maxBodyLength: MAX_SOURCE_BYTES,
    },
  );
  const content = Buffer.from(response.data);
  if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(
      'DOCUMENT_PREVIEW_OFFICE_INVALID: Office Worker 未返回有效 PDF',
    );
  }
  return content;
}

/** 使用固定纸张、字号和行距把安全文本切分为 WebP 页面。 */
async function* convertText(
  source: DocumentPageSource,
): AsyncGenerator<ConvertedDocumentPage> {
  const content = await readSourceBuffer(
    source,
    documentsConfig.upload.maxTextPreviewBytes,
  );
  const raw = content.toString('utf8').replaceAll('\u0000', '');
  const safeText =
    source.contentType === 'text/markdown'
      ? await markdownToSafeText(raw)
      : raw;
  const lines = wrapTextLines(safeText);
  const linesPerPage = Math.floor(
    (TEXT_PAGE_HEIGHT - TEXT_MARGIN * 2) / TEXT_LINE_HEIGHT,
  );
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));
  if (pageCount > MAX_PAGE_COUNT) {
    throw new Error(
      `DOCUMENT_PREVIEW_PAGE_LIMIT: 文本排版后超过 ${MAX_PAGE_COUNT} 页`,
    );
  }
  for (let index = 0; index < pageCount; index++) {
    const pageLines = lines.slice(
      index * linesPerPage,
      (index + 1) * linesPerPage,
    );
    const svg = renderTextPageSvg(pageLines);
    const pageContent = await sharp(Buffer.from(svg))
      .webp({ quality: 84 })
      .toBuffer();
    yield {
      pageNumber: index + 1,
      width: TEXT_PAGE_WIDTH,
      height: TEXT_PAGE_HEIGHT,
      contentType: 'image/webp',
      content: pageContent,
    };
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

/** 生成不包含外链、脚本或本地文件引用的纯 SVG 文本页。 */
function renderTextPageSvg(lines: string[]): string {
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="${TEXT_MARGIN}" y="${TEXT_MARGIN + TEXT_FONT_SIZE + index * TEXT_LINE_HEIGHT}">${escapeXml(line || ' ')}</tspan>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXT_PAGE_WIDTH}" height="${TEXT_PAGE_HEIGHT}" viewBox="0 0 ${TEXT_PAGE_WIDTH} ${TEXT_PAGE_HEIGHT}"><rect width="100%" height="100%" fill="#fff"/><text font-family="monospace" font-size="${TEXT_FONT_SIZE}" fill="#111">${text}</text></svg>`;
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

/** 在可信大小上限内把对象流读取为内存 Buffer。 */
async function readSourceBuffer(
  source: DocumentPageSource,
  maxBytes: number,
): Promise<Buffer> {
  if (source.size > maxBytes) {
    throw new Error(
      `DOCUMENT_PREVIEW_SOURCE_LIMIT: 源文件超过 ${maxBytes} 字节预览上限`,
    );
  }
  const stream = await source.open();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error(
        `DOCUMENT_PREVIEW_SOURCE_LIMIT: 源文件超过 ${maxBytes} 字节预览上限`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
