import { createDocumentError } from '../errors.js';
import { localTextParser } from './local-text.js';
import { remoteDocumentParser } from './remote-document.js';

import type { DocumentParser } from '../types.js';

const parsers: DocumentParser[] = [localTextParser, remoteDocumentParser];

/** 按可信 MIME 选择唯一 文档解析器。 */
export function getDocumentParser(contentType: string) {
  const parser = parsers.find((item) => item.contentTypes.includes(contentType));
  if (!parser) {
    throw createDocumentError(
      'DOCUMENT_PARSER_NOT_SUPPORTED',
      `不支持解析文件类型：${contentType}`,
    );
  }
  return parser;
}

/** 返回解析器只读副本，供诊断和测试使用。 */
export function listDocumentParsers() {
  return [...parsers];
}
