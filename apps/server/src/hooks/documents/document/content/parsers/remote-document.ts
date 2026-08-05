import axios from 'axios';
import { marked } from 'marked';

import { ROOT } from '@/configs/index.js';
import { documentsConfig } from '../../../config.js';
import { hashToUuid } from '../ids.js';
import { contentTypeConfig } from '@repo/shared';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser, DocumentParserInput } from '../types.js';
import type { Token, Tokens } from 'marked';

/** TextIn 异步解析任务的稳定状态。 */
type TextInJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** 解析阶段用于恢复 TextIn 异步任务的持久化信息。 */
interface TextInParseCheckpoint {
  /** checkpoint 归属，避免误用其他解析器留下的数据。 */
  provider: 'textin-xparse';
  /** checkpoint 结构版本。 */
  version: 1;
  /** TextIn 返回的异步任务标识。 */
  jobId: string;
  /** 最近一次确认的上游任务状态。 */
  status: TextInJobStatus;
}

/** TextIn 查询接口返回的必要任务字段。 */
interface TextInJobResult {
  /** TextIn 异步任务标识。 */
  jobId: string;
  /** 当前任务状态。 */
  status: TextInJobStatus;
  /** 任务完成后用于下载完整解析结果的地址。 */
  resultUrl?: string;
}

const TEXT_IN_ASYNC_PATH = 'api/v1/xparse/parse/async';
const TEXT_IN_PARSE_CONFIG = {
  capabilities: {
    table_view: 'markdown',
  },
  config: {
    force_engine: 'textin',
    engine_params: {
      parse_mode: 'auto',
    },
  },
};
const REMOTE_DOCUMENT_CONTENT_TYPES = [
  ...new Set([
    ...contentTypeConfig.pdf.flatMap((item) => item.mime),
    ...contentTypeConfig.word.flatMap((item) => item.mime),
    ...contentTypeConfig.ppt.flatMap((item) => item.mime),
    ...contentTypeConfig.excel.flatMap((item) => item.mime),
  ]),
];

/** 使用 TextIn xParse 异步接口解析 PDF 与 Office 文档。 */
export const remoteDocumentParser: DocumentParser = {
  name: 'remote-document',
  version: 'textin-xparse-async-1.3.0',
  contentTypes: REMOTE_DOCUMENT_CONTENT_TYPES,
  /** 提交或恢复持久化 TextIn job，完成后把 Markdown 转换为统一文档块。 */
  async parse(input) {
    try {
      const credentials = getTextInCredentials();
      let checkpoint = parseTextInCheckpoint(input.checkpoint);
      if (!checkpoint) {
        const jobId = await createTextInJob(input, credentials);
        checkpoint = {
          provider: 'textin-xparse',
          version: 1,
          jobId,
          status: 'pending',
        };
        await input.saveCheckpoint(checkpoint);
      }
      const result = await waitForTextInResult(checkpoint, credentials, input);
      return parseTextInResponse(result, input.file.fileId);
    } catch (error) {
      throw normalizeTextInError(error);
    }
  },
};

/**
 * 读取并校验 TextIn 代理接口配置。
 *
 * @returns xParse 基础地址与 Bearer 鉴权请求头。
 */
function getTextInCredentials(): {
  /** TextIn API 基础地址。 */
  baseUrl: string;
  /** TextIn 代理 Bearer 鉴权请求头。 */
  headers: Record<string, string>;
} {
  const baseUrl = documentsConfig.document.textInBaseUrl;
  if (!baseUrl) {
    throw new Error(
      'DOCUMENT_PARSER_ENDPOINT_MISSING: AI.textIn.baseUrl 未配置',
    );
  }
  const apiKey = ROOT.AI?.textIn?.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'DOCUMENT_PARSER_AUTH_MISSING: AI.textIn.apiKey 未配置',
    );
  }
  return {
    baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

/**
 * 创建 TextIn 异步解析任务。
 *
 * @param input 文档源、checkpoint 和 lease 控制器。
 * @param credentials TextIn 地址与鉴权头。
 * @returns TextIn 返回且可用于恢复轮询的 job_id。
 */
async function createTextInJob(
  input: DocumentParserInput,
  credentials: ReturnType<typeof getTextInCredentials>,
): Promise<string> {
  await input.assertActive();
  const form = new FormData();
  form.append('file_url', await input.file.createDownloadUrl());
  form.append('config', JSON.stringify(TEXT_IN_PARSE_CONFIG));
  const response = await axios.post<unknown>(
    buildTextInUrl(credentials.baseUrl, TEXT_IN_ASYNC_PATH),
    form,
    {
      headers: credentials.headers,
      timeout: documentsConfig.document.textInRequestTimeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );
  const data = getTextInResponseData(response.data, '创建异步解析任务');
  if (typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 未返回有效 job_id',
    );
  }
  return data.job_id;
}

/**
 * 恢复轮询 TextIn job，并在完成后下载完整结果。
 *
 * @param checkpoint 已持久化的 TextIn job 信息。
 * @param credentials TextIn 地址与鉴权头。
 * @param input 文档解析阶段的 checkpoint 与 lease 控制器。
 * @returns 与新版同步接口相同的完整响应体。
 */
async function waitForTextInResult(
  checkpoint: TextInParseCheckpoint,
  credentials: ReturnType<typeof getTextInCredentials>,
  input: DocumentParserInput,
): Promise<unknown> {
  const startedAt = Date.now();
  let lastStatus = checkpoint.status;
  while (Date.now() - startedAt < documentsConfig.document.textInMaxWaitMs) {
    await input.assertActive();
    const job = await getTextInJob(checkpoint.jobId, credentials);
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      await input.saveCheckpoint({
        ...checkpoint,
        status: job.status,
      } satisfies TextInParseCheckpoint);
    }
    if (job.status === 'failed') {
      throw new Error(
        `DOCUMENT_PARSER_UPSTREAM_FAILED: TextIn 异步解析任务失败（job_id=${job.jobId}）`,
      );
    }
    if (job.status === 'completed') {
      if (!job.resultUrl) {
        throw new Error(
          'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 完成任务未返回 result_url',
        );
      }
      await input.assertActive();
      const response = await axios.get<unknown>(job.resultUrl, {
        headers: credentials.headers,
        timeout: documentsConfig.document.textInRequestTimeoutMs,
        maxContentLength: Infinity,
      });
      return response.data;
    }
    await wait(documentsConfig.document.textInPollIntervalMs);
  }
  throw new Error(
    `DOCUMENT_PARSER_ASYNC_TIMEOUT: TextIn 异步解析等待超时（job_id=${checkpoint.jobId}）`,
  );
}

/**
 * 查询 TextIn 异步任务状态。
 *
 * @param jobId 已持久化的 TextIn job_id。
 * @param credentials TextIn 地址与鉴权头。
 * @returns 当前任务状态与完成后的结果地址。
 */
async function getTextInJob(
  jobId: string,
  credentials: ReturnType<typeof getTextInCredentials>,
): Promise<TextInJobResult> {
  const path = `${TEXT_IN_ASYNC_PATH}/${encodeURIComponent(jobId)}`;
  const response = await axios.get<unknown>(
    buildTextInUrl(credentials.baseUrl, path),
    {
      headers: credentials.headers,
      timeout: documentsConfig.document.textInRequestTimeoutMs,
      maxContentLength: Infinity,
    },
  );
  const data = getTextInResponseData(response.data, '查询异步解析任务');
  if (typeof data.job_id !== 'string' || data.job_id !== jobId) {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 状态响应 job_id 不匹配',
    );
  }
  if (!isTextInJobStatus(data.status)) {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 返回了未知任务状态',
    );
  }
  const result: TextInJobResult = {
    jobId: data.job_id,
    status: data.status,
  };
  if (typeof data.result_url === 'string' && data.result_url) {
    result.resultUrl = data.result_url;
  }
  return result;
}

/**
 * 从 TextIn 新版响应中读取业务 data，并统一业务错误。
 *
 * @param value TextIn 未经信任的响应体。
 * @param operation 当前调用动作，用于生成安全错误摘要。
 * @returns 通过业务 code 校验的 data 对象。
 */
function getTextInResponseData(
  value: unknown,
  operation: string,
): Record<string, unknown> {
  const response = toRecord(value);
  if (!response) {
    throw new Error(
      `DOCUMENT_PARSER_INVALID_RESPONSE: TextIn ${operation}返回体无效`,
    );
  }
  const code = response.code;
  if (code === 40101 || code === 40102) {
    throw new Error('DOCUMENT_PARSER_AUTH_FAILED: TextIn 代理鉴权失败');
  }
  if (code !== 200) {
    throw new Error(
      `DOCUMENT_PARSER_UPSTREAM_FAILED: TextIn ${operation}失败（${String(code ?? 'unknown')}）`,
    );
  }
  const data = toRecord(response.data);
  if (!data) {
    throw new Error(
      `DOCUMENT_PARSER_INVALID_RESPONSE: TextIn ${operation}未返回 data`,
    );
  }
  return data;
}

/**
 * 从阶段 checkpoint 恢复 TextIn job。
 *
 * @param value 数据库存储并重新解析的未知 checkpoint。
 * @returns 首次处理时返回空；已有合法 job 时返回恢复信息。
 */
function parseTextInCheckpoint(
  value: unknown,
): TextInParseCheckpoint | undefined {
  if (value === undefined || value === null) return undefined;
  const checkpoint = toRecord(value);
  if (
    checkpoint?.provider !== 'textin-xparse' ||
    checkpoint.version !== 1 ||
    typeof checkpoint.jobId !== 'string' ||
    !checkpoint.jobId ||
    !isTextInJobStatus(checkpoint.status)
  ) {
    throw new Error(
      'DOCUMENT_PARSER_CHECKPOINT_INVALID: TextIn 异步任务恢复信息无效',
    );
  }
  return {
    provider: 'textin-xparse',
    version: 1,
    jobId: checkpoint.jobId,
    status: checkpoint.status,
  };
}

/**
 * 判断未知值是否为 TextIn 支持的任务状态。
 *
 * @param value TextIn 状态响应或 checkpoint 中的未知状态。
 * @returns 属于稳定状态枚举时返回真。
 */
function isTextInJobStatus(value: unknown): value is TextInJobStatus {
  return (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed'
  );
}

/**
 * 基于配置的 API 根地址构造 TextIn xParse 接口地址。
 *
 * @param baseUrl TextIn API 根地址。
 * @param path 不以斜杠开头的 xParse 接口路径。
 * @returns 可供 Axios 调用的完整 URL。
 */
function buildTextInUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

/**
 * 等待下一次 TextIn 状态查询，避免高频轮询。
 *
 * @param milliseconds 等待毫秒数。
 * @returns 定时器到期后完成。
 */
async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * 将 TextIn 响应转换为仓库统一文档块。
 *
 * @param value TextIn xParse `result_url` 下载得到的新版响应体。
 * @param fileId 当前源文件稳定标识，用于生成确定性块 ID。
 * @returns 可继续进行标准化、切分和向量化的文档块。
 */
export function parseTextInResponse(
  value: unknown,
  fileId: string,
): DocumentParsedBlock[] {
  const data = getTextInResponseData(value, '下载解析结果');
  if (typeof data.markdown !== 'string') {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 未返回 Markdown 内容',
    );
  }
  return parseTextInMarkdown(data.markdown, fileId);
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
      metadata: {
        ...content.metadata,
        source: 'textin-xparse',
      },
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * 将 Axios 与适配器错误归一化为可进入文件任务中心的安全错误。
 *
 * @param error TextIn 请求或响应转换期间抛出的未知错误。
 * @returns 不包含密钥和上游响应正文的稳定错误对象。
 */
function normalizeTextInError(error: unknown): Error {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) return error;
    return new Error('DOCUMENT_PARSER_FAILED: TextIn 文档解析失败');
  }
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    return new Error(
      'DOCUMENT_PARSER_AUTH_FAILED: TextIn 代理鉴权失败，请检查 AI.textIn.apiKey',
    );
  }
  if (status === 429) {
    return new Error('DOCUMENT_PARSER_RATE_LIMITED: TextIn 请求频率受限');
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new Error('DOCUMENT_PARSER_TIMEOUT: TextIn 单次请求超时');
  }
  let statusSummary = '';
  if (status) statusSummary = `（HTTP ${status}）`;
  return new Error(
    `DOCUMENT_PARSER_REQUEST_FAILED: TextIn 请求失败${statusSummary}`,
  );
}
