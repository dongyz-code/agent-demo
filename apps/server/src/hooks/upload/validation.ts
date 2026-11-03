import { isUtf8 } from 'node:buffer';
import { fileTypeFromBuffer } from 'file-type';

import { ROOT_ERROR } from '@/configs/error.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { getUploadPolicy } from './config.js';

import type { FilePurpose } from '@repo/types';

/** OOXML 类型检测可能需要读取较靠后的 ZIP 条目，保留最多 1 MiB 前缀。 */
export const MAGIC_PREFIX_BYTES = 1024 * 1024;

/** 文件名不允许携带路径分隔符或跨平台特殊字符。 */
const illegalFilenameChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex -- 清洗文件名中的 C0/C1 控制字符
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/** 服务端计算的 Multipart 分片方案。 */
export interface MultipartPlan {
  /** 除末片外的分片目标字节数。 */
  partSize: number;
  /** 从 1 开始连续编号的分片总数。 */
  partCount: number;
}

/** 上传声明校验的完整输入。 */
interface FileDeclaration {
  /** 用户提供的原始文件名。 */
  filename: string;
  /** 初始化时声明的 MIME。 */
  contentType: string;
  /** 完整文件字节数。 */
  size: number;
  /** 由服务端策略约束的用途。 */
  purpose: FilePurpose;
}

/**
 * 清洗仅用于显示和下载响应的文件名。
 *
 * @param filename 用户上传时的原始文件名。
 * @returns 不含路径与控制字符、最长 255 字符的名称。
 */
export function sanitizeUploadFilename(filename: string): string {
  return (
    filename
      .trim()
      .replace(illegalFilenameChars, '_')
      .replace(controlChars, '_')
      .slice(0, 255) || 'file'
  );
}

/**
 * 根据用途验证文件声明，客户端不能扩大类型或大小限制。
 *
 * @param input 文件名、MIME、字节数和固定用途。
 * @returns 清洗后的名称与共享注册表支持的扩展名。
 */
export function validateFileDeclaration(input: FileDeclaration) {
  const policy = getUploadPolicy(input.purpose);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('文件上传: 文件不能为空');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw new ROOT_ERROR('文件上传: 文件大小超过限制');
  }
  if (
    typeof input.filename !== 'string' ||
    typeof input.contentType !== 'string'
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const filename = sanitizeUploadFilename(input.filename);
  const extension = getFileExtension(filename);
  if (!extension) throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  const format = contentTypesByExtension[extension];
  if (
    !policy.allowedTypes.includes(format.type) ||
    !format.mime.includes(input.contentType)
  ) {
    throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  }
  return { filename, extension };
}

/**
 * 计算满足 S3 最小片大小与最多 10000 片约束的分片方案。
 *
 * @param fileSize 文件完整字节数。
 * @param preferredPartSize 服务端首选片大小。
 * @returns 按 MiB 向上取整的分片大小及总片数。
 */
export function calculateMultipartPlan(
  fileSize: number,
  preferredPartSize: number,
): MultipartPlan {
  const step = 1024 * 1024;
  const required = Math.max(
    5 * step,
    preferredPartSize,
    Math.ceil(fileSize / 10_000),
  );
  const partSize = Math.ceil(required / step) * step;
  return { partSize, partCount: Math.ceil(fileSize / partSize) };
}

/**
 * 验证文件前缀，二进制使用签名检测，文本额外拒绝非 UTF-8 与空字节。
 *
 * @param prefix 长度受限的源文件前缀。
 * @param filename 已规范化的文件名。
 * @param declaredContentType 上传时声明的 MIME。
 * @returns 共享格式注册表中的规范 MIME，验证不通过返回空。
 */
export async function detectTrustedContentType(
  prefix: Buffer,
  filename: string,
  declaredContentType: string,
): Promise<string | undefined> {
  const extension = getFileExtension(filename);
  if (!extension) return undefined;
  const format = contentTypesByExtension[extension];
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(prefix);
  } catch {
    return undefined;
  }
  if (detected) {
    if (!format.mime.includes(detected.mime)) return undefined;
    return format.mime[0];
  }
  if (format.type !== 'text' || !format.mime.includes(declaredContentType))
    return undefined;
  // 前缀边界可能截断 UTF-8 字符，保留最后最多三个字节用于兼容完整多字节字符。
  let text = prefix;
  if (prefix.length === MAGIC_PREFIX_BYTES) {
    for (let trim = 0; trim <= 3; trim++) {
      text = prefix.subarray(0, prefix.length - trim);
      if (isUtf8(text)) break;
    }
  }
  if (!isUtf8(text) || text.includes(0)) return undefined;
  return format.mime[0];
}
