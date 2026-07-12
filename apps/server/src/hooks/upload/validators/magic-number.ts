import { fileTypeFromBuffer } from 'file-type';

import type { FileValidator } from './types.js';

/** 使用文件签名识别二进制格式的验证器。 */
export const magicNumberValidator: FileValidator = {
  name: 'magic-number',
  order: 10,
  async validate(input) {
    const result = await fileTypeFromBuffer(input.prefix);
    return { contentType: result?.mime };
  },
};
