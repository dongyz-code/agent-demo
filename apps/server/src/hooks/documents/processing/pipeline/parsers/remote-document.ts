import axios from 'axios';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser } from '../types.js';

const REMOTE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** 远程解析服务允许返回的统一块类型。 */
const BLOCK_TYPES = new Set<DocumentParsedBlock['type']>([
  'heading',
  'paragraph',
  'table',
  'code',
  'image',
]);

/** PDF 与 Office 的远程统一解析器适配器。 */
export const remoteDocumentParser: DocumentParser = {
  name: 'remote-document',
  version: '1',
  contentTypes: REMOTE_TYPES,
  async parse({ file }) {
    const config = ROOT.document;
    if (!config.parserEndpoint) {
      throw new ROOT_ERROR(
        '数据异常',
        'DOCUMENT_PARSER_UNAVAILABLE: 未配置 PDF/Office 解析服务',
      );
    }
    const response = await axios.post<DocumentParsedBlock[]>(
      `${config.parserEndpoint}/parse`,
      await file.openStream(),
      {
        headers: {
          'Content-Type': file.contentType,
          'X-File-Id': file.fileId,
          'X-Filename': encodeURIComponent(file.filename),
        },
        timeout: config.parserTimeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
    return validateRemoteBlocks(response.data);
  },
};

/** 校验远程解析结果，禁止库专属结构越过适配器。 */
function validateRemoteBlocks(value: unknown): DocumentParsedBlock[] {
  if (!Array.isArray(value)) {
    throw new ROOT_ERROR(
      '服务异常',
      'DOCUMENT_PARSER_INVALID_RESPONSE: 解析服务返回格式错误',
    );
  }
  return value.map((item, position) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('blockId' in item) ||
      !('type' in item) ||
      !('text' in item)
    ) {
      throw new ROOT_ERROR(
        '服务异常',
        `DOCUMENT_PARSER_INVALID_RESPONSE: 解析服务第 ${position + 1} 个块格式错误`,
      );
    }
    const block = item as DocumentParsedBlock;
    if (!BLOCK_TYPES.has(block.type)) {
      throw new ROOT_ERROR(
        '服务异常',
        `DOCUMENT_PARSER_INVALID_RESPONSE: 解析服务第 ${position + 1} 个块类型不受支持`,
      );
    }
    return {
      blockId: String(block.blockId),
      type: block.type,
      text: String(block.text),
      headingPath: Array.isArray(block.headingPath)
        ? block.headingPath.map(String)
        : [],
      page: typeof block.page === 'number' ? block.page : null,
      position,
      metadata:
        block.metadata && typeof block.metadata === 'object'
          ? block.metadata
          : {},
    };
  });
}
