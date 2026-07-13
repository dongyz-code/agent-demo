import { magicNumberValidator } from './magic-number.js';

import type { FileValidationInput, FileValidator } from './types.js';

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
