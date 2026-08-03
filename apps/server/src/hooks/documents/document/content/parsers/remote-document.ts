import axios from 'axios';
import { marked } from 'marked';

import { ROOT } from '@/configs/index.js';
import { documentsConfig } from '../../../config.js';
import { hashToUuid } from '../ids.js';
import {
  binaryContentType,
  contentTypeConfig,
  getFileExtension,
} from '@repo/shared';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser, DocumentParserInput } from '../types.js';
import type { Token, Tokens } from 'marked';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const MAX_LOCAL_PDF_BYTES = 64 * 1024 * 1024;
const MIN_LOCAL_PDF_SEMANTIC_CHARACTERS = 40;
const MIN_LOCAL_PDF_SEMANTIC_CHARACTERS_PER_PAGE = 20;
const MIN_LOCAL_PDF_PAGE_CHARACTERS = 8;
const MIN_LOCAL_PDF_READABLE_RATIO = 0.85;
const REMOTE_DOCUMENT_CONTENT_TYPES = [
  ...new Set([
    ...contentTypeConfig.pdf.flatMap((item) => item.mime),
    ...contentTypeConfig.word.flatMap((item) => item.mime),
    ...contentTypeConfig.ppt.flatMap((item) => item.mime),
    ...contentTypeConfig.excel.flatMap((item) => item.mime),
  ]),
];

/** PDF 优先读取本地文本层，无法可靠提取时与 Office 一并回退 TextIn。 */
export const remoteDocumentParser: DocumentParser = {
  name: 'remote-document',
  version: `pdfjs-${pdfjs.version}:textin-v1`,
  contentTypes: REMOTE_DOCUMENT_CONTENT_TYPES,
  /** 优先本地解析数字 PDF，其余情况调用 TextIn 并转换统一文档块。 */
  async parse({ file }) {
    if (getFileExtension(file.filename) === 'pdf') {
      const localBlocks = await tryParseLocalPdf(file);
      if (localBlocks) return localBlocks;
    }

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
            'Content-Type': binaryContentType,
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
 * 尝试从 PDF 自带文本层直接生成文档块。
 *
 * @param file 已验证且可重复打开的 PDF 源文件。
 * @returns 文本层质量足够时返回按页组织的块，否则返回空并交给远程解析。
 */
async function tryParseLocalPdf(
  file: DocumentParserInput['file'],
): Promise<DocumentParsedBlock[] | undefined> {
  if (file.size > MAX_LOCAL_PDF_BYTES) return undefined;

  try {
    const source = await readLocalPdf(file);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(source),
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        try {
          const textContent = await page.getTextContent();
          pages.push(extractPdfPageText(textContent.items));
        } finally {
          page.cleanup();
        }
      }
      if (!isReliablePdfText(pages)) return undefined;
      return pages.flatMap((text, index) => {
        if (!text) return [];
        const pageNumber = index + 1;
        return [
          {
            blockId: hashToUuid(
              `${file.fileId}:pdfjs:${pageNumber}:${text}`,
            ),
            type: 'paragraph',
            text,
            headingPath: [],
            page: pageNumber,
            position: index,
            metadata: { source: 'pdf-text-layer' },
          },
        ];
      });
    } finally {
      await document.destroy();
    }
  } catch {
    return undefined;
  }
}

/**
 * 把受限大小的 PDF 流读取为 PDF.js 所需的完整字节。
 *
 * @param file 已验证的 PDF 源文件。
 * @returns 不超过本地解析上限的 PDF 字节。
 */
async function readLocalPdf(file: DocumentParserInput['file']): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const stream = await file.openStream();
  for await (const chunk of stream) {
    const content = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += content.length;
    if (totalBytes > MAX_LOCAL_PDF_BYTES) {
      throw new Error('DOCUMENT_LOCAL_PDF_TOO_LARGE');
    }
    chunks.push(content);
  }
  return Buffer.concat(chunks, totalBytes);
}

/**
 * 将 PDF.js 文本项按原有换行和必要的西文词间距拼成单页文本。
 *
 * @param items PDF.js 返回的文本项与标记项。
 * @returns 清理多余行内空白后的单页文本。
 */
function extractPdfPageText(items: unknown[]): string {
  let source = '';
  let previous = '';
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue;
    if (typeof item.str !== 'string') continue;
    if (shouldInsertPdfTextSpace(previous, item.str)) source += ' ';
    source += item.str;
    previous = item.str;
    if ('hasEOL' in item && item.hasEOL === true) {
      source += '\n';
      previous = '';
    }
  }
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 判断相邻 PDF 文本项之间是否需要补一个西文词间空格。
 *
 * @param previous 前一个 PDF 文本项。
 * @param current 当前 PDF 文本项。
 * @returns 两端都是拉丁字母或数字且原文未携带空白时返回真。
 */
function shouldInsertPdfTextSpace(previous: string, current: string): boolean {
  return (
    /[\p{Script=Latin}\p{N}]$/u.test(previous) &&
    /^[\p{Script=Latin}\p{N}]/u.test(current)
  );
}

/**
 * 判断本地文本层是否足以替代远程文档识别。
 *
 * @param pages 按 PDF 页码排列的本地提取文本。
 * @returns 总体文字量、页面覆盖和字符可读性均达标时返回真。
 */
function isReliablePdfText(pages: string[]): boolean {
  if (!pages.length) return false;
  const semanticCounts = pages.map(
    (text) => text.match(/[\p{L}\p{N}]/gu)?.length ?? 0,
  );
  const semanticCharacterCount = semanticCounts.reduce(
    (total, count) => total + count,
    0,
  );
  const requiredCharacterCount = Math.max(
    MIN_LOCAL_PDF_SEMANTIC_CHARACTERS,
    pages.length * MIN_LOCAL_PDF_SEMANTIC_CHARACTERS_PER_PAGE,
  );
  if (semanticCharacterCount < requiredCharacterCount) return false;

  const readablePageCount = semanticCounts.filter(
    (count) => count >= MIN_LOCAL_PDF_PAGE_CHARACTERS,
  ).length;
  const allowedSparsePageCount = pages.length >= 5 ? 1 : 0;
  if (readablePageCount < pages.length - allowedSparsePageCount) return false;

  const text = pages.join('');
  const visibleCharacterCount = text.match(/\S/gu)?.length ?? 0;
  const readableCharacterCount =
    text.match(/[\p{L}\p{M}\p{N}\p{P}\p{S}]/gu)?.length ?? 0;
  return (
    visibleCharacterCount > 0 &&
    readableCharacterCount / visibleCharacterCount >=
      MIN_LOCAL_PDF_READABLE_RATIO
  );
}

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
