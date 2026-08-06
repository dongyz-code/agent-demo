import axios from 'axios';
import FormData from 'form-data';
import { marked } from 'marked';

import { logger, ROOT } from '@/configs/index.js';
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
  /** 已确认完成时保存的结果地址，恢复后可绕过不稳定的状态查询接口。 */
  resultUrl?: string;
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
  const response = await runTextInRequest('创建异步解析任务', async () => {
    await input.assertActive();
    const source = await input.file.openStream();
    const form = new FormData();
    form.append('file', source, {
      filename: input.file.filename,
      contentType: input.file.contentType,
      knownLength: input.file.size,
    });
    form.append('config', JSON.stringify(TEXT_IN_PARSE_CONFIG));
    try {
      return await axios.post<unknown>(
        buildTextInUrl(credentials.baseUrl, TEXT_IN_ASYNC_PATH),
        form,
        {
          headers: {
            ...credentials.headers,
            ...form.getHeaders(),
          },
          timeout: documentsConfig.document.textInRequestTimeoutMs,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );
    } catch (error) {
      source.destroy();
      throw error;
    }
  });
  const data = getTextInResponseData(response.data, '创建异步解析任务');
  if (typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error(
      'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 未返回有效 job_id',
    );
  }
  return data.job_id;
}

/**
 * 对 TextIn 单次 HTTP 调用执行有限的瞬时故障重试。
 *
 * 创建请求若已被上游接收但代理丢失响应，重试可能留下未被本任务引用的上游 job；
 * 当前 API 没有可用幂等键，因此用有限尝试在可用性与重复成本之间取舍。
 *
 * @param operation 不含文件信息的调用阶段，用于安全重试日志。
 * @param request 每次调用都创建全新请求体或执行幂等 GET 的动作。
 * @returns 首次成功的 TextIn HTTP 响应。
 */
async function runTextInRequest<T>(
  operation: string,
  request: () => Promise<T>,
): Promise<T> {
  const config = documentsConfig.document;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (
        !isRetryableTextInRequestError(error) ||
        attempt >= config.textInRequestMaxAttempts
      ) {
        throw error;
      }
      const delayMs = config.textInRequestRetryDelayMs * attempt;
      let code: string | undefined;
      let status: number | undefined;
      if (axios.isAxiosError(error)) {
        code = error.code;
        status = error.response?.status;
      }
      logger.warn(
        {
          event: 'document.parser.textin.retry',
          operation,
          attempt,
          maxAttempts: config.textInRequestMaxAttempts,
          delayMs,
          code,
          status,
        },
        'TextIn 请求发生瞬时故障，准备重试',
      );
      await wait(delayMs);
    }
  }
}

/**
 * 判断 TextIn 请求错误是否属于可恢复的网络或代理故障。
 *
 * @param error Axios 或业务代码抛出的未知错误。
 * @returns HTTP 502/503/504、超时、连接重置或临时 DNS 故障时返回真。
 */
function isRetryableTextInRequestError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  return [
    'ECONNABORTED',
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN',
    'ERR_NETWORK',
  ].includes(error.code ?? '');
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
  if (checkpoint.status === 'completed' && checkpoint.resultUrl) {
    return await downloadTextInResult(checkpoint.resultUrl, credentials, input);
  }
  const startedAt = Date.now();
  let lastStatus = checkpoint.status;
  while (Date.now() - startedAt < documentsConfig.document.textInMaxWaitMs) {
    await input.assertActive();
    let job: TextInJobResult;
    try {
      job = await getTextInJob(checkpoint.jobId, credentials);
    } catch (error) {
      if (!isRetryableTextInRequestError(error)) throw error;
      logger.warn(
        {
          event: 'document.parser.textin.poll_deferred',
          jobId: checkpoint.jobId,
        },
        'TextIn 状态查询持续失败，将在总等待窗口内继续轮询',
      );
      await wait(documentsConfig.document.textInPollIntervalMs);
      continue;
    }
    if (
      job.status !== lastStatus ||
      (job.resultUrl && job.resultUrl !== checkpoint.resultUrl)
    ) {
      lastStatus = job.status;
      await input.saveCheckpoint({
        ...checkpoint,
        status: job.status,
        resultUrl: job.resultUrl,
      } satisfies TextInParseCheckpoint);
    }
    if (job.status === 'failed') {
      throw new Error(
        `DOCUMENT_PARSER_UPSTREAM_FAILED: TextIn 异步解析任务失败（job_id=${job.jobId}）`,
      );
    }
    if (job.status === 'completed') {
      const resultUrl = job.resultUrl;
      if (!resultUrl) {
        throw new Error(
          'DOCUMENT_PARSER_INVALID_RESPONSE: TextIn 完成任务未返回 result_url',
        );
      }
      return await downloadTextInResult(resultUrl, credentials, input);
    }
    await wait(documentsConfig.document.textInPollIntervalMs);
  }
  throw new Error(
    `DOCUMENT_PARSER_ASYNC_TIMEOUT: TextIn 异步解析等待超时（job_id=${checkpoint.jobId}）`,
  );
}

/**
 * 下载 TextIn 已完成 job 的结果 JSON。
 *
 * @param resultUrl 状态接口返回并持久化的结果地址。
 * @param credentials TextIn 地址与鉴权头。
 * @param input 当前解析阶段的 lease 控制器。
 * @returns TextIn xParse 直接结果响应体。
 */
async function downloadTextInResult(
  resultUrl: string,
  credentials: ReturnType<typeof getTextInCredentials>,
  input: DocumentParserInput,
): Promise<unknown> {
  await input.assertActive();
  const response = await runTextInRequest('下载解析结果', async () =>
    axios.get<unknown>(resultUrl, {
      headers: credentials.headers,
      timeout: documentsConfig.document.textInRequestTimeoutMs,
      maxContentLength: Infinity,
    }),
  );
  return response.data;
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
  const response = await runTextInRequest('查询异步解析任务', async () =>
    axios.get<unknown>(buildTextInUrl(credentials.baseUrl, path), {
      headers: credentials.headers,
      timeout: documentsConfig.document.textInRequestTimeoutMs,
      maxContentLength: Infinity,
    }),
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
    !isTextInJobStatus(checkpoint.status) ||
    (checkpoint.resultUrl !== undefined &&
      (typeof checkpoint.resultUrl !== 'string' || !checkpoint.resultUrl))
  ) {
    throw new Error(
      'DOCUMENT_PARSER_CHECKPOINT_INVALID: TextIn 异步任务恢复信息无效',
    );
  }
  const parsed: TextInParseCheckpoint = {
    provider: 'textin-xparse',
    version: 1,
    jobId: checkpoint.jobId,
    status: checkpoint.status,
  };
  if (typeof checkpoint.resultUrl === 'string') {
    parsed.resultUrl = checkpoint.resultUrl;
  }
  return parsed;
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
  const directResult = toRecord(value);
  let data: Record<string, unknown>;
  if (typeof directResult?.markdown === 'string') {
    data = directResult;
  } else {
    data = getTextInResponseData(value, '下载解析结果');
  }
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
