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

/** 文件内容验证器输出。 */
export interface FileValidationResult {
  /** 识别到的可信 MIME；无法识别时为空。 */
  contentType?: string;
}

/** 可组合文件内容验证器。 */
export interface FileValidator {
  /** 验证器稳定名称。 */
  name: string;
  /** 验证器执行顺序，数值越小越先执行。 */
  order: number;
  /** 执行内容检测。 */
  validate: (input: FileValidationInput) => Promise<FileValidationResult>;
}

/** 流式计算 SHA-256，调用后输入流会被完整消费。 */
export async function calculateSha256Stream(stream: Readable) {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/** 使用文件签名识别二进制格式的验证器。 */
const magicNumberValidator: FileValidator = {
  name: 'magic-number',
  order: 10,
  async validate(input) {
    const result = await fileTypeFromBuffer(input.prefix);
    return { contentType: result?.mime };
  },
};

const validators: FileValidator[] = [magicNumberValidator].sort(
  (left, right) => left.order - right.order,
);

/**
 * 依次执行内容验证器并返回第一个可信 MIME。
 *
 * 文本格式通常没有稳定 Magic Number，仅允许受策略约束的 text 声明回退。
 */
export async function detectTrustedContentType(input: FileValidationInput) {
  for (const validator of validators) {
    const result = await validator.validate(input);
    if (result.contentType) {
      return result.contentType;
    }
  }
  if (['text/plain', 'text/markdown', 'text/csv'].includes(input.declaredContentType)) {
    return input.declaredContentType;
  }
  return undefined;
}
