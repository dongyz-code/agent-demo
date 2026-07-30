import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import {
  contentTypesByExtension,
  getFileExtension,
} from '@repo/shared';

import type { Readable } from 'node:stream';
import type { SupportedFileExtension } from '@repo/shared';

/** 文件内容验证器输入。 */
export interface FileValidationInput {
  /** 文件前缀字节。 */
  prefix: Buffer;
  /** 用户上传时提供的文件名，用于约束签名识别范围。 */
  filename: string;
  /** 初始化时声明的 MIME。 */
  declaredContentType: string;
}

const TEXT_EXTENSIONS: readonly SupportedFileExtension[] = ['txt', 'md', 'csv'];

/** 流式计算 SHA-256，调用后输入流会被完整消费。 */
export async function calculateSha256Stream(stream: Readable) {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * 使用文件签名识别可信 MIME。
 *
 * 文本格式通常没有稳定 Magic Number，仅允许受策略约束的 text 声明回退。
 *
 * @param input 文件前缀与客户端声明 MIME。
 * @returns 二进制签名识别结果、允许的文本回退或空。
 */
export async function detectTrustedContentType(input: FileValidationInput) {
  const extension = getFileExtension(input.filename);
  if (!extension) return undefined;
  const compatibleContentTypes: readonly string[] =
    contentTypesByExtension[extension];

  const detected = await fileTypeFromBuffer(input.prefix);
  if (detected?.mime) {
    if (!compatibleContentTypes.includes(detected.mime)) return undefined;
    return compatibleContentTypes[0];
  }
  if (!TEXT_EXTENSIONS.includes(extension)) return undefined;
  if (!compatibleContentTypes.includes(input.declaredContentType)) {
    return undefined;
  }
  return compatibleContentTypes[0];
}
