import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';

import type { Readable } from 'node:stream';

/** 文件内容验证器输入。 */
export interface FileValidationInput {
  /** 文件前缀字节。 */
  prefix: Buffer;
  /** 初始化时声明的 MIME。 */
  declaredContentType: string;
}

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
  const detected = await fileTypeFromBuffer(input.prefix);
  if (detected?.mime) return detected.mime;
  if (
    ['text/plain', 'text/markdown', 'text/csv'].includes(
      input.declaredContentType,
    )
  ) {
    return input.declaredContentType;
  }
  return undefined;
}
