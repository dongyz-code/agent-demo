import axios from 'axios';
import { marked } from 'marked';

import { ROOT } from '@/configs/index.js';
import { documentsConfig } from '../../../config.js';
import { hashToUuid } from '../ids.js';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser } from '../types.js';
import type { Token, Tokens } from 'marked';

const REMOTE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** PDF 与 Office 的 TextIn 远程解析器适配器。 */
export const remoteDocumentParser: DocumentParser = {
  name: 'remote-document',
  version: 'textin-v1',
  contentTypes: REMOTE_TYPES,
  /** 调用 TextIn 并把 Markdown 响应转换为仓库统一文档块。 */
  async parse({ file }) {
    const config = documentsConfig.document;
    if (!config.parserEndpoint) {
      throw new Error(
        'DOCUMENT_PARSER_ENDPOINT_MISSING: TextIn 解析地址未配置',
      );
    }
    const apiKey = ROOT.AI?.textIn?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('DOCUMENT_PARSER_AUTH_MISSING: AI.textIn.apiKey 未配置');
    }

    try {
      const response = await axios.post<unknown>(
        config.parserEndpoint,
        await file.openStream(),
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/octet-stream',
          },
          timeout: config.parserTimeoutMs,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );
      return parseTextInResponse(response.data, file.fileId);
    } catch (error) {
      throw normalizeTextInError(error);
    }
  },
};

/**
 * 将 TextIn 响应转换为仓库统一文档块。
 *
 * @param value TextIn `pdf_to_markdown` 接口响应体。
 * @param fileId 当前源文件稳定标识，用于生成确定性块 ID。
 * @returns 可继续进行标准化、切分和向量化的文档块。
 */
export function parseTextInResponse(
  value: unknown,
  fileId: string,
): DocumentParsedBlock[] {
  const response = toRecord(value);
  const code = response?.code;
  if (code !== undefined && String(code) !== '200') {
    throw new Error(
      `DOCUMENT_PARSER_UPSTREAM_FAILED: TextIn 解析失败（${String(code)}）`,
    );
  }

  const result = toRecord(response?.result);
  if (typeof result?.markdown !== 'string') {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 未返回 Markdown 内容',
    );
  }
  return parseTextInMarkdown(result.markdown, fileId);
}

/**
 * 把单份 TextIn Markdown 按标题、正文、表格与代码结构转换为统一块。
 *
 * @param markdown TextIn 输出的 Markdown 文本。
 * @param fileId 当前源文件稳定标识。
 * @returns 保持原始阅读顺序的文档块。
 */
function parseTextInMarkdown(
  markdown: string,
  fileId: string,
): DocumentParsedBlock[] {
  const blocks: DocumentParsedBlock[] = [];
  const headingPath: string[] = [];

  marked.lexer(markdown).forEach((token) => {
    const content = getTokenContent(token);
    if (!content) return;

    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      headingPath.splice(
        Math.max(0, heading.depth - 1),
        headingPath.length,
        heading.text.trim(),
      );
    }
    const position = blocks.length;
    blocks.push({
      blockId: hashToUuid(
        `${fileId}:textin:${position}:${content.type}:${content.text}`,
      ),
      type: content.type,
      text: content.text,
      headingPath: [...headingPath],
      page: null,
      position,
      metadata: content.metadata,
    });
  });

  return blocks;
}

/**
 * 提取 Marked 顶层 token 的业务内容，过滤分隔线和空白等无检索价值节点。
 *
 * @param token Marked 词法分析产生的顶层 token。
 * @returns 对应统一块内容；无需入库的 token 返回空。
 */
function getTokenContent(token: Token):
  | {
      /** 统一文档块类型。 */
      type: DocumentParsedBlock['type'];
      /** 保留必要 Markdown 结构的块文本。 */
      text: string;
      /** TextIn/Markdown 节点的补充信息。 */
      metadata: Record<string, unknown>;
    }
  | undefined {
  if (token.type === 'space' || token.type === 'hr' || token.type === 'def') {
    return undefined;
  }
  if (token.type === 'heading') {
    const heading = token as Tokens.Heading;
    return {
      type: 'heading',
      text: heading.text.trim(),
      metadata: { depth: heading.depth },
    };
  }
  if (token.type === 'table') {
    return { type: 'table', text: token.raw.trim(), metadata: {} };
  }
  if (token.type === 'code') {
    const code = token as Tokens.Code;
    return {
      type: 'code',
      text: code.text.trim(),
      metadata: code.lang ? { language: code.lang } : {},
    };
  }
  if (token.type === 'paragraph') {
    const paragraph = token as Tokens.Paragraph;
    const image =
      paragraph.tokens.length === 1 && paragraph.tokens[0]?.type === 'image'
        ? (paragraph.tokens[0] as Tokens.Image)
        : undefined;
    if (image) {
      return {
        type: 'image',
        text: image.text.trim() || `图片：${image.href}`,
        metadata: { href: image.href, title: image.title },
      };
    }
  }

  const text = token.raw.trim();
  return text ? { type: 'paragraph', text, metadata: {} } : undefined;
}

/**
 * 把未知值收窄为普通对象。
 *
 * @param value 外部接口返回的未知值。
 * @returns 非数组普通对象；其他值返回空。
 */
function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * 将 Axios 与适配器错误归一化为可进入文件任务中心的安全错误。
 *
 * @param error TextIn 请求或响应转换期间抛出的未知错误。
 * @returns 不包含密钥和上游响应正文的稳定错误对象。
 */
function normalizeTextInError(error: unknown): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error
      ? error
      : new Error('DOCUMENT_PARSER_FAILED: TextIn 文档解析失败');
  }
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    return new Error(
      'DOCUMENT_PARSER_AUTH_FAILED: TextIn 代理鉴权失败，请检查 AI.textIn.apiKey',
    );
  }
  if (error.code === 'ECONNABORTED') {
    return new Error('DOCUMENT_PARSER_TIMEOUT: TextIn 文档解析超时');
  }
  return new Error(
    `DOCUMENT_PARSER_REQUEST_FAILED: TextIn 请求失败${status ? `（HTTP ${status}）` : ''}`,
  );
}
