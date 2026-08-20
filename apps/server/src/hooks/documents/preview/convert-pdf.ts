/**
 * PDF 类型预览页面转换。
 *
 * pdfjs 依赖的 DOMMatrix/ImageData/Path2D 全局垫片与动态导入集中在本模块，
 * 避免污染其它转换路径；主分发仅通过版本号感知底层渲染器。
 */

import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';

import {
  encodePreviewPage,
  MAX_PAGE_COUNT,
  PREVIEW_PAGE_VARIANTS,
  PREVIEW_VARIANT_CONFIGS,
} from './shared.js';

import type { ConvertedDocumentPage } from './shared.js';

// pdfjs 在 Node 环境需要 DOMMatrix/ImageData/Path2D，补到 globalThis 一次即可。
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

/** 当前 PDF 渲染器版本，供主分发组合页面转换器版本号。 */
export const PDFJS_VERSION = pdfjs.version;

/** 单页渲染像素硬上限，防止超大页面撑爆内存。 */
const MAX_PAGE_PIXELS = 24_000_000;

/**
 * 将 PDF 按 quick、clear 顺序逐页渲染并规范化为 WebP。
 *
 * @param content 已受文件大小上限约束的可信 PDF 字节。
 * @returns 先输出完整快速集合、再输出完整清晰集合的异步序列。
 */
export async function* convertPdf(
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
