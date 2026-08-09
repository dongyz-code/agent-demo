import { ROOT_ERROR } from '@/configs/index.js';
import { textParser } from './text.js';
import { textInParser } from './textin.js';

import type { DocumentParser } from '../types.js';

const documentParsers: DocumentParser[] = [textParser, textInParser];

/** 按可信 MIME 选择唯一文档解析器。 */
export function getDocumentParser(contentType: string) {
  const parser = documentParsers.find((item) =>
    item.contentTypes.includes(contentType),
  );
  if (!parser) {
    throw new ROOT_ERROR('文件处理: 不支持的文件类型', `: ${contentType}`);
  }
  return parser;
}
