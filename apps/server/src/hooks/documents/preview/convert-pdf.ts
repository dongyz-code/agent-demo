/**
 * PDF 类型预览页面转换。
 *
 * 用 mutool 按页画成 PNG，再交给 sharp 编成预览图。
 * Office 文件先由 soffice 转成 PDF，再进入这里。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';
import { spawnAsync } from '@repo/utils-node';
import { documentsConfig } from '../config.js';

import {
  encodePreviewPage,
  MAX_PAGE_COUNT,
  PREVIEW_PAGE_VARIANTS,
  PREVIEW_VARIANT_CONFIGS,
} from './shared.js';

import type { ConvertedDocumentPage, PreviewVariantConfig } from './shared.js';
import type { DocumentPreviewPageVariant } from '@repo/types';

/** mutool 可执行名。生产环境安装 mupdf-tools 即可。 */
const MUTOOL_BINARY = 'mutool';
/** 单页渲染像素硬上限，防止超大页面撑爆内存。 */
const MAX_PAGE_PIXELS = 24_000_000;

/** PDF 页面在用户空间里的宽高，单位是 point。 */
interface PdfPageBox {
  /** 从 1 开始的页码。 */
  pageNumber: number;
  /** 页面宽度。 */
  width: number;
  /** 页面高度。 */
  height: number;
}

/**
 * 将 PDF 按 quick、clear 顺序逐页渲染并规范化为 WebP。
 *
 * @param content 已受文件大小上限约束的可信 PDF 字节。
 * @returns 先输出完整快速集合、再输出完整清晰集合的异步序列。
 */
export async function* convertPdf(
  content: Buffer,
): AsyncGenerator<ConvertedDocumentPage> {
  const workdir = await mkdtemp(join(tmpdir(), 'pdf-preview-'));
  try {
    const pdfPath = join(workdir, 'input.pdf');
    await writeFile(pdfPath, content);
    const listed = parseMutoolPages(await runMutool(['pages', pdfPath]));
    if (!listed.length) {
      throw new ROOT_ERROR('PDF 页面渲染失败', { reason: '没有可读页面' });
    }
    if (listed.length > MAX_PAGE_COUNT) {
      throw new ROOT_ERROR('PDF 页数超过上限', { limit: MAX_PAGE_COUNT });
    }
    const output = join(workdir, 'page.png');
    for (const variant of PREVIEW_PAGE_VARIANTS) {
      const config = PREVIEW_VARIANT_CONFIGS[variant];
      for (let index = 0; index < listed.length; index += 1) {
        const page = listed[index]!;
        const pixels = pagePixels(page, config);
        await runMutool([
          'draw',
          '-q',
          '-r',
          String(Math.max(1, Math.round(pixels.dpi))),
          '-w',
          String(pixels.width),
          '-h',
          String(pixels.height),
          '-o',
          output,
          pdfPath,
          String(page.pageNumber),
        ]);
        yield await encodeRenderedPage(
          await readFile(output),
          index + 1,
          variant,
          config.webpQuality,
        );
      }
    }
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/**
 * 运行一次 mutool，失败时带上截断后的错误输出。
 *
 * @param args mutool 子命令和参数，不含可执行名。
 * @returns 标准输出拼成的文本。
 */
async function runMutool(args: string[]) {
  const { promise, stats } = await spawnAsync({
    cmd: MUTOOL_BINARY,
    args,
    timeout: documentsConfig.document.officePreviewTimeoutMs,
    log: false,
  });
  await promise;
  if (stats.status !== 'success') {
    throw new ROOT_ERROR('PDF 页面渲染失败', {
      status: stats.status,
      code: stats.code,
      signal: stats.signal,
      stderr: stats.stderr.join('\n').slice(0, 2000),
    });
  }
  return stats.stdout.join('\n');
}

/**
 * 从 mutool pages 的输出读取每一页的宽高。
 *
 * 优先用 CropBox。有 90 度或 270 度旋转时交换宽高。
 *
 * @param xml mutool pages 的输出。
 * @returns 按页码排序的页面尺寸。
 */
function parseMutoolPages(xml: string) {
  const pages: PdfPageBox[] = [];
  const pattern = /<page pagenum="(\d+)">([\s\S]*?)<\/page>/g;
  for (const match of xml.matchAll(pattern)) {
    const body = match[2] ?? '';
    const box = readBox(body, 'CropBox') ?? readBox(body, 'MediaBox');
    if (!box) continue;
    let width = Math.abs(box.r - box.l);
    let height = Math.abs(box.t - box.b);
    const rotate = /<Rotate v="(\d+)"/.exec(body);
    const angle = rotate ? Number(rotate[1]) % 360 : 0;
    if (angle === 90 || angle === 270) {
      const swapped = width;
      width = height;
      height = swapped;
    }
    if (width <= 0 || height <= 0) continue;
    pages.push({
      pageNumber: Number(match[1]),
      width,
      height,
    });
  }
  pages.sort((left, right) => left.pageNumber - right.pageNumber);
  return pages;
}

/**
 * 读取一个页面盒子的四条边。
 *
 * @param body 单页 XML。
 * @param name CropBox 或 MediaBox。
 * @returns 四条边的数值；没有该盒子时为 null。
 */
function readBox(body: string, name: string) {
  const match = new RegExp(
    `<${name} l="([^"]+)" b="([^"]+)" r="([^"]+)" t="([^"]+)"`,
  ).exec(body);
  if (!match) return null;
  return {
    l: Number(match[1]),
    b: Number(match[2]),
    r: Number(match[3]),
    t: Number(match[4]),
  };
}

/**
 * 按预览层级把 PDF 点尺寸换成像素和分辨率。
 *
 * @param page 页面点尺寸。
 * @param config 当前层级的渲染参数。
 * @returns mutool 使用的像素上限和 dpi。
 */
function pagePixels(page: PdfPageBox, config: PreviewVariantConfig) {
  let scale = config.pdfRenderScale;
  if (config.pdfMaxWidth) {
    scale = Math.min(scale, config.pdfMaxWidth / page.width);
  }
  let width = page.width * scale;
  let height = page.height * scale;
  const pixels = width * height;
  if (pixels > MAX_PAGE_PIXELS) {
    const pixelScale = Math.sqrt(MAX_PAGE_PIXELS / pixels);
    width *= pixelScale;
    height *= pixelScale;
    scale *= pixelScale;
  }
  return {
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.ceil(height)),
    dpi: 72 * scale,
  };
}

/**
 * 把 mutool 画出的 PNG 铺白底并编成预览图。
 *
 * @param png 单页 PNG。
 * @param pageNumber 从 1 开始的连续页码。
 * @param variant 快速或清晰层级。
 * @param quality 编码质量。
 * @returns 可上传的预览页。
 */
async function encodeRenderedPage(
  png: Buffer,
  pageNumber: number,
  variant: DocumentPreviewPageVariant,
  quality: number,
): Promise<ConvertedDocumentPage> {
  const metadata = await sharp(png).metadata();
  if (!metadata.width || !metadata.height) {
    throw new ROOT_ERROR('无法读取转换后页面尺寸');
  }
  const { content, contentType } = await encodePreviewPage(
    sharp(png).flatten({ background: '#ffffff' }),
    metadata.width,
    metadata.height,
    quality,
  );
  return {
    pageNumber,
    variant,
    width: metadata.width,
    height: metadata.height,
    contentType,
    content,
  };
}
