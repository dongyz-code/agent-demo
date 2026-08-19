import { DOMMatrix, ImageData, Path2D, createCanvas } from '@napi-rs/canvas';
import axios from 'axios';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';
import { collectMimes, readStreamToBuffer } from '@/utils/index.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { documentsConfig } from '../config.js';
import { documentFile } from '../file/index.js';

import type { Readable } from 'node:stream';
import type { DocumentPreviewPageVariant } from '@repo/types';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const IMAGE_TYPES: ReadonlySet<string> = new Set(collectMimes('image'));
const PDF_TYPES: ReadonlySet<string> = new Set(collectMimes('pdf'));
const OFFICE_TYPES: ReadonlySet<string> = new Set(
  collectMimes('word', 'ppt', 'excel'),
);
const TEXT_TYPES: ReadonlySet<string> = new Set(collectMimes('text'));
const WEBP_CONTENT_TYPE = contentTypesByExtension.webp.mime[0];
const JPEG_CONTENT_TYPE = contentTypesByExtension.jpeg.mime[0];
const MAX_SOURCE_BYTES = documentsConfig.upload.maxFileSizeBytes;
const MAX_PAGE_COUNT = 1_000;
const MAX_PAGE_PIXELS = 24_000_000;
/** WebP 单维像素硬上限，超过则降级为 JPEG 编码。 */
const WEBP_MAX_EDGE = 16383;
/** 图片长短边比值超过该阈值时按超长图处理，保证短边清晰。 */
const SUPER_LONG_IMAGE_ASPECT = 3;
const TEXT_PAGE_WIDTH = 1_191;
const TEXT_PAGE_HEIGHT = 1_684;
const TEXT_MARGIN = 72;
const TEXT_FONT_SIZE = 28;
const TEXT_LINE_HEIGHT = 42;
const TEXT_LINE_LENGTH = 74;

/** 两个页面层级及其固定生成顺序。 */
const PREVIEW_PAGE_VARIANTS: readonly DocumentPreviewPageVariant[] = [
  'quick',
  'clear',
];

/** 单个页面层级使用的受控渲染与编码参数。 */
interface PreviewVariantConfig {
  /** PDF 基础渲染倍率。 */
  pdfRenderScale: number;
  /** PDF 页面可选最大宽度；清晰层不额外限制宽度。 */
  pdfMaxWidth: number | null;
  /** 图片最长边像素上限。 */
  imageMaxEdge: number;
  /** 超长图短边目标像素，不超过原图短边以避免放大插值。 */
  imageTargetShortEdge: number;
  /** 超长图总像素上限，防止文件与内存失控。 */
  imageMaxPixels: number;
  /** 文本页面相对现有逻辑纸张的像素倍率。 */
  textRenderScale: number;
  /** WebP 有损编码质量。 */
  webpQuality: number;
}

/** 各预览层级的固定质量参数，禁止由不可信请求覆盖。 */
const PREVIEW_VARIANT_CONFIGS: Record<
  DocumentPreviewPageVariant,
  PreviewVariantConfig
> = {
  quick: {
    pdfRenderScale: 1.35,
    pdfMaxWidth: 800,
    imageMaxEdge: 800,
    imageTargetShortEdge: 800,
    imageMaxPixels: 10_000_000,
    textRenderScale: 2 / 3,
    webpQuality: 78,
  },
  clear: {
    pdfRenderScale: 4,
    pdfMaxWidth: null,
    imageMaxEdge: 3_200,
    imageTargetShortEdge: 2_000,
    imageMaxPixels: 60_000_000,
    textRenderScale: 2,
    webpQuality: 96,
  },
};

/** 当前页面转换器组合版本，规则或底层渲染器变化时必须递增。 */
export const DOCUMENT_PREVIEW_CONVERTER_VERSION = [
  'document-pages-v3-progressive',
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
  /** 当前页面属于快速或清晰层级。 */
  variant: DocumentPreviewPageVariant;
  /** 页面图片像素宽度。 */
  width: number;
  /** 页面图片像素高度。 */
  height: number;
  /** 页面图片可信 MIME，常规为 WebP，单维超限时降级为 JPEG。 */
  contentType: string;
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

/**
 * 将图片校正方向并生成指定层级的单页 WebP。
 *
 * @param input 已受文件大小上限约束的可信源图片字节。
 * @param variant 本次生成的快速或清晰层级。
 * @returns 包含层级、尺寸和内容的单页图片。
 */
async function convertImage(
  input: Buffer,
  variant: DocumentPreviewPageVariant,
): Promise<ConvertedDocumentPage> {
  const config = PREVIEW_VARIANT_CONFIGS[variant];
  const sourceMeta = await sharp(input).metadata();
  // EXIF orientation 5-8 表示 90/270 度旋转，rotate 后宽高互换。
  const swaps = (sourceMeta.orientation ?? 0) >= 5;
  const width0 = swaps ? sourceMeta.height : sourceMeta.width;
  const height0 = swaps ? sourceMeta.width : sourceMeta.height;
  if (!width0 || !height0) {
    throw new Error('无法读取图片尺寸');
  }
  const { opts, targetWidth, targetHeight } = resolveImageResize(
    width0,
    height0,
    config,
  );
  const { content, contentType } = await encodePreviewPage(
    sharp(input).rotate().resize(opts),
    targetWidth,
    targetHeight,
    config.webpQuality,
  );
  const metadata = await sharp(content).metadata();
  if (!metadata.width || !metadata.height) {
    throw new ROOT_ERROR('无法读取转换后页面尺寸');
  }
  return {
    pageNumber: 1,
    variant,
    width: metadata.width,
    height: metadata.height,
    contentType,
    content,
  };
}

/**
 * 按目标尺寸选择 WebP 或 JPEG 编码，单维超过 WebP 上限时降级为 JPEG。
 *
 * @param pipeline 已完成 resize 的 Sharp pipeline。
 * @param width 目标像素宽度。
 * @param height 目标像素高度。
 * @param quality 编码质量。
 * @returns 编码后的 buffer 与可信 MIME。
 */
async function encodePreviewPage(
  pipeline: ReturnType<typeof sharp>,
  width: number,
  height: number,
  quality: number,
): Promise<{ content: Buffer; contentType: string }> {
  if (width > WEBP_MAX_EDGE || height > WEBP_MAX_EDGE) {
    const content = await pipeline.jpeg({ quality }).toBuffer();
    return { content, contentType: JPEG_CONTENT_TYPE };
  }
  const content = await pipeline.webp({ quality }).toBuffer();
  return { content, contentType: WEBP_CONTENT_TYPE };
}

/**
 * 按原图长宽比选择图片 resize 策略与目标尺寸。
 *
 * 正常图限制最长边；超长图改为短边优先，保证横向清晰，长边按总像素上限等比收敛。
 *
 * @param width 原图经方向校正后的像素宽度。
 * @param height 原图经方向校正后的像素高度。
 * @param config 当前层级的固定质量参数。
 * @returns 交给 Sharp 的 resize 选项及用于选择编码格式的目标尺寸。
 */
function resolveImageResize(
  width: number,
  height: number,
  config: PreviewVariantConfig,
) {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge / shortEdge <= SUPER_LONG_IMAGE_ASPECT) {
    return {
      opts: {
        width: config.imageMaxEdge,
        height: config.imageMaxEdge,
        fit: 'inside' as const,
        withoutEnlargement: true,
      },
      targetWidth: config.imageMaxEdge,
      targetHeight: config.imageMaxEdge,
    };
  }
  // 超长图：短边优先保证横向清晰，长边按总像素上限等比收敛，且不放大原图短边。
  const targetShort = Math.min(shortEdge, config.imageTargetShortEdge);
  const scaledLong = longEdge * (targetShort / shortEdge);
  const pixelScale = Math.min(
    1,
    Math.sqrt(config.imageMaxPixels / (targetShort * scaledLong)),
  );
  const finalShort = Math.max(1, Math.round(targetShort * pixelScale));
  const finalLong = Math.max(1, Math.round(scaledLong * pixelScale));
  const isPortrait = height >= width;
  return {
    opts: isPortrait
      ? {
          width: finalShort,
          height: finalLong,
          fit: 'inside' as const,
          withoutEnlargement: true,
        }
      : {
          width: finalLong,
          height: finalShort,
          fit: 'inside' as const,
          withoutEnlargement: true,
        },
    targetWidth: isPortrait ? finalShort : finalLong,
    targetHeight: isPortrait ? finalLong : finalShort,
  };
}

/**
 * 将 PDF 按 quick、clear 顺序逐页渲染并规范化为 WebP。
 *
 * @param content 已受文件大小上限约束的可信 PDF 字节。
 * @returns 先输出完整快速集合、再输出完整清晰集合的异步序列。
 */
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
      throw new ROOT_ERROR('PDF 页数超过上限', { limit: MAX_PAGE_COUNT });
    }
    for (const variant of PREVIEW_PAGE_VARIANTS) {
      const config = PREVIEW_VARIANT_CONFIGS[variant];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        try {
          const defaultViewport = page.getViewport({ scale: 1 });
          let renderScale = config.pdfRenderScale;
          if (config.pdfMaxWidth) {
            renderScale = Math.min(
              renderScale,
              config.pdfMaxWidth / defaultViewport.width,
            );
          }
          const baseViewport = page.getViewport({ scale: renderScale });
          const pixelScale = Math.min(
            1,
            Math.sqrt(
              MAX_PAGE_PIXELS / (baseViewport.width * baseViewport.height),
            ),
          );
          const viewport = page.getViewport({
            scale: renderScale * pixelScale,
          });
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
          const { content: pageContent, contentType } = await encodePreviewPage(
            sharp(await canvas.encode('png')),
            width,
            height,
            config.webpQuality,
          );
          yield {
            pageNumber,
            variant,
            width,
            height,
            contentType,
            content: pageContent,
          };
        } finally {
          page.cleanup();
        }
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
    throw new ROOT_ERROR('未配置 Office 转换 Worker');
  }
  const signed = await documentFile.presignGet({
    bucket: source.bucket,
    objectKey: source.objectKey,
    contentType: source.contentType,
    filename: source.filename,
    disposition: 'attachment',
  });
  const response = await axios.post<ArrayBuffer>(
    endpoint,
    {
      sourceUrl: signed.url,
      filename: source.filename,
      target: 'pdf',
    },
    {
      responseType: 'arraybuffer',
      timeout: documentsConfig.document.officePreviewTimeoutMs,
      maxContentLength: MAX_SOURCE_BYTES,
      maxBodyLength: MAX_SOURCE_BYTES,
    },
  );
  const content = Buffer.from(response.data);
  if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new ROOT_ERROR('Office Worker 未返回有效 PDF');
  }
  return content;
}

/**
 * 使用固定逻辑纸张把安全文本切分，并依次输出两个页面层级。
 *
 * @param source 已验证文本源文件及其受控读取函数。
 * @returns 页码一致且 quick 在 clear 之前的页面异步序列。
 */
async function* convertText(
  source: DocumentPageSource,
): AsyncGenerator<ConvertedDocumentPage> {
  const content = await readSourceBuffer(
    source,
    documentsConfig.upload.maxTextPreviewBytes,
  );
  const raw = content.toString('utf8').replaceAll('\u0000', '');
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

/** 在可信大小上限内把对象流读取为内存 Buffer。 */
async function readSourceBuffer(
  source: DocumentPageSource,
  maxBytes: number,
): Promise<Buffer> {
  if (source.size > maxBytes) {
    throw new ROOT_ERROR('源文件超过预览大小上限', { maxBytes });
  }
  return readStreamToBuffer(await source.open(), maxBytes);
}
