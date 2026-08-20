/**
 * 预览页面转换的共享基建：跨类型复用的接口、常量与工具。
 *
 * 各类型转换模块（convert-image/convert-pdf/convert-text）与主分发
 * converter.ts 均依赖本文件；本文件不反向依赖任何转换模块，保证单向依赖、
 * 无循环。
 */

import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';
import { readStreamToBuffer } from '@/utils/index.js';
import { contentTypesByExtension } from '@repo/shared';
import { documentsConfig } from '../config.js';

import type { Readable } from 'node:stream';
import type { DocumentPreviewPageVariant } from '@repo/types';

const WEBP_CONTENT_TYPE = contentTypesByExtension.webp.mime[0];
const JPEG_CONTENT_TYPE = contentTypesByExtension.jpeg.mime[0];
/** 源文件字节数上限，与上传限制一致。 */
const MAX_SOURCE_BYTES = documentsConfig.upload.maxFileSizeBytes;
/** 单文档预览页数上限。 */
const MAX_PAGE_COUNT = 1_000;
/** WebP 单维像素硬上限，超过则降级为 JPEG 编码。 */
const WEBP_MAX_EDGE = 16383;

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

export {
  MAX_SOURCE_BYTES,
  MAX_PAGE_COUNT,
  PREVIEW_PAGE_VARIANTS,
  PREVIEW_VARIANT_CONFIGS,
};

export type { PreviewVariantConfig };

/**
 * 按目标尺寸选择 WebP 或 JPEG 编码，单维超过 WebP 上限时降级为 JPEG。
 *
 * @param pipeline 已完成 resize 的 Sharp pipeline。
 * @param width 目标像素宽度。
 * @param height 目标像素高度。
 * @param quality 编码质量。
 * @returns 编码后的 buffer 与可信 MIME。
 */
export async function encodePreviewPage(
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
 * 在可信大小上限内把对象流读取为内存 Buffer。
 *
 * @param source 可信源文件及其受控读取函数。
 * @param maxBytes 允许读取的最大字节数。
 * @returns 流全部内容拼接后的 Buffer。
 */
export async function readSourceBuffer(
  source: DocumentPageSource,
  maxBytes: number,
): Promise<Buffer> {
  if (source.size > maxBytes) {
    throw new ROOT_ERROR('源文件超过预览大小上限', { maxBytes });
  }
  return readStreamToBuffer(await source.open(), maxBytes);
}
