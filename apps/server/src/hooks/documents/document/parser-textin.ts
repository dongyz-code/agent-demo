import axios from 'axios';
import FormData from 'form-data';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { collectMimes } from '@/utils/index.js';
import { reTryFunc, sleep } from '@repo/utils-node';
import { documentsConfig } from '../config.js';
import { parseTextContent } from './parser-text.js';

import type { DocumentParser } from './types.js';

/** TextIn 标准业务响应。 */
interface TextInResponse<T> {
  /** 200 表示请求成功。 */
  code: number;
  /** 当前接口的业务数据。 */
  data?: T;
}

/** TextIn 创建或查询任务返回的数据。 */
interface TextInJobData {
  /** 异步任务标识。 */
  job_id?: string;
  /** 异步任务状态。 */
  status?: string;
  /** 完成后用于下载 Markdown 的地址。 */
  result_url?: string;
}

/** TextIn 结果下载接口返回的数据。 */
interface TextInResult {
  /** 文档识别生成的 Markdown。 */
  markdown?: string;
}

const TEXT_IN_ASYNC_PATH = 'api/v1/xparse/parse/async';
const TEXT_IN_CHECKPOINT = {
  provider: 'textin-xparse',
  version: 1,
} as const;
const TEXT_IN_PARSE_CONFIG = {
  capabilities: { table_view: 'markdown' },
  config: {
    force_engine: 'textin',
    engine_params: { parse_mode: 'auto' },
  },
};
const TEXT_IN_CONTENT_TYPES = collectMimes(
  'image',
  'pdf',
  'word',
  'ppt',
  'excel',
);

/** 使用 TextIn xParse 异步接口把图片、PDF 与 Office 文档转换为 Markdown。 */
export const textInParser: DocumentParser = {
  name: 'textin',
  version: 'textin-xparse-async-1.4.0',
  contentTypes: TEXT_IN_CONTENT_TYPES,
  /** 提交或恢复 TextIn job，下载完成后的 Markdown 并交给文本解析器。 */
  async parse(input) {
    const config = documentsConfig.document;
    const baseUrl = config.textInBaseUrl;
    const apiKey = ROOT.AI?.textIn?.apiKey?.trim();
    if (!baseUrl) {
      throw new ROOT_ERROR('AI.textIn.baseUrl 未配置');
    }
    if (!apiKey) {
      throw new ROOT_ERROR('AI.textIn.apiKey 未配置');
    }

    const client = axios.create({
      baseURL: `${baseUrl.replace(/\/+$/, '')}/`,
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: config.textInRequestTimeoutMs,
      maxContentLength: Infinity,
    });
    const retryOptions = {
      count: config.textInRequestMaxAttempts,
      duration: config.textInRequestRetryDelayMs,
    };

    let jobId: string | undefined;
    let resultUrl: string | undefined;
    if (input.checkpoint !== undefined && input.checkpoint !== null) {
      const checkpoint = input.checkpoint as Record<string, unknown>;
      if (
        checkpoint.provider !== TEXT_IN_CHECKPOINT.provider ||
        checkpoint.version !== TEXT_IN_CHECKPOINT.version ||
        typeof checkpoint.jobId !== 'string' ||
        !checkpoint.jobId
      ) {
        throw new ROOT_ERROR('TextIn 异步任务恢复信息无效');
      }
      jobId = checkpoint.jobId;
    }
    if (!jobId) {
      const submit = reTryFunc(
        async () => {
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
            return await client.post<TextInResponse<TextInJobData>>(
              TEXT_IN_ASYNC_PATH,
              form,
              {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                timeout: config.textInSubmitTimeoutMs,
              },
            );
          } catch (error) {
            source.destroy();
            throw error;
          }
        },
        { ...retryOptions, label: 'TextIn 创建异步解析任务' },
      );
      const response = (await submit()).data;
      if (response.code !== 200 || !response.data?.job_id) {
        throw new ROOT_ERROR('TextIn 未返回有效 job_id');
      }
      jobId = response.data.job_id;
      await input.saveCheckpoint({ ...TEXT_IN_CHECKPOINT, jobId });
    }

    const activeJobId = jobId;
    const deadline = Date.now() + config.textInMaxWaitMs;
    while (!resultUrl) {
      if (Date.now() >= deadline) {
        throw new ROOT_ERROR('TextIn 异步解析等待超时', {
          job_id: activeJobId,
        });
      }
      await input.assertActive();
      const query = reTryFunc(
        () =>
          client.get<TextInResponse<TextInJobData>>(
            `${TEXT_IN_ASYNC_PATH}/${encodeURIComponent(activeJobId)}`,
          ),
        { ...retryOptions, label: 'TextIn 查询异步解析任务' },
      );
      const response = (await query()).data;
      const data = response.data;
      if (response.code !== 200 || !data || data.job_id !== activeJobId) {
        throw new ROOT_ERROR('TextIn 状态响应 job_id 不匹配');
      }
      if (data.status === 'failed') {
        throw new ROOT_ERROR('TextIn 异步解析任务失败', {
          job_id: activeJobId,
        });
      }
      if (data.status === 'completed') {
        if (typeof data.result_url !== 'string' || !data.result_url) {
          throw new ROOT_ERROR('TextIn 完成任务未返回 result_url');
        }
        resultUrl = data.result_url;
        break;
      }
      if (data.status !== 'pending' && data.status !== 'in_progress') {
        throw new ROOT_ERROR('TextIn 返回了未知任务状态');
      }
      await sleep(config.textInPollIntervalMs);
    }

    await input.assertActive();
    const completedResultUrl = resultUrl;
    const download = reTryFunc(
      () => client.get<TextInResult>(completedResultUrl),
      { ...retryOptions, label: 'TextIn 下载解析结果' },
    );
    const result = (await download()).data;
    if (typeof result.markdown !== 'string') {
      throw new ROOT_ERROR('TextIn 未返回 Markdown 内容');
    }
    return parseTextContent(result.markdown, input.file.fileId, true);
  },
};
