import { ROOT_ERROR } from '@/configs/index.js';
import { localTextParser } from './local-text.js';
import { remoteDocumentParser } from './remote-document.js';

import type { DocumentParser } from '../types.js';

const parsers: DocumentParser[] = [localTextParser, remoteDocumentParser];

/** 按可信 MIME 选择唯一文档解析器。 */
export function getDocumentParser(contentType: string) {
  const parser = parsers.find((item) =>
    item.contentTypes.includes(contentType),
  );
  if (!parser) {
    throw new ROOT_ERROR(
      '非法参数',
      `DOCUMENT_PARSER_NOT_SUPPORTED: 不支持解析文件类型：${contentType}`,
    );
  }
  return parser;
}
