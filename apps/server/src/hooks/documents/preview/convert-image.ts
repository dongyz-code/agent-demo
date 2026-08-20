/**
 * 图片类型预览页面转换。
 *
 * 独立于 PDF/文本/Office 转换；仅依赖 shared 的编码与层级参数。
 */

import sharp from 'sharp';

import { ROOT_ERROR } from '@/configs/index.js';

import {
  encodePreviewPage,
  PREVIEW_VARIANT_CONFIGS,
} from './shared.js';

import type { ConvertedDocumentPage, PreviewVariantConfig } from './shared.js';
import type { DocumentPreviewPageVariant } from '@repo/types';

/** 图片长短边比值超过该阈值时按超长图处理，保证短边清晰。 */
const SUPER_LONG_IMAGE_ASPECT = 3;

/**
 * 将图片校正方向并生成指定层级的单页 WebP。
 *
 * @param input 已受文件大小上限约束的可信源图片字节。
 * @param variant 本次生成的快速或清晰层级。
 * @returns 包含层级、尺寸和内容的单页图片。
 */
export async function convertImage(
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
