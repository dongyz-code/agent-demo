import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test, { mock } from 'node:test';

import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

import { ROOT } from '@/configs/index.js';
import { documentsConfig } from '../../../config.js';
import { remoteDocumentParser } from './remote-document.js';

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { DocumentParserInput } from '../types.js';

/** 测试中用于确认 multipart 确实挂载源文件流的最小内部结构。 */
interface InspectableFormStream {
  /** `form-data` 包装前的原始可读流。 */
  source?: unknown;
}

/** 仅在测试中读取 `form-data` 已追加的 multipart 部件。 */
interface InspectableFormData extends FormData {
  /** multipart 头、字段值、流包装器与边界回调。 */
  _streams: Array<string | InspectableFormStream | (() => void)>;
}

/**
 * 构造带 HTTP 状态的 Axios 错误，覆盖代理瞬时失败重试分支。
 *
 * @param status 模拟的 HTTP 响应状态。
 * @returns 可被 `axios.isAxiosError` 识别的响应错误。
 */
function createAxiosStatusError(status: number): AxiosError {
  const error = new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_RESPONSE);
  error.response = { status } as AxiosResponse;
  return error;
}

test('TextIn 异步任务重试瞬时故障并保存 checkpoint', async () => {
  const originalTextIn = ROOT.AI?.textIn;
  const originalBaseUrl = documentsConfig.document.textInBaseUrl;
  const originalRetryDelay = documentsConfig.document.textInRequestRetryDelayMs;
  const originalPollInterval = documentsConfig.document.textInPollIntervalMs;
  ROOT.AI ??= {};
  ROOT.AI.textIn = {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.textin.com',
  };
  documentsConfig.document.textInBaseUrl = 'https://api.textin.com';
  documentsConfig.document.textInRequestRetryDelayMs = 0;
  documentsConfig.document.textInPollIntervalMs = 0;

  const checkpoints: unknown[] = [];
  let source: Readable | undefined;
  let submitCount = 0;
  let statusCount = 0;
  let resultCount = 0;
  mock.method(
    axios,
    'post',
    async (url: string, body: unknown, config?: AxiosRequestConfig) => {
      submitCount += 1;
      assert.equal(url, 'https://api.textin.com/api/v1/xparse/parse/async');
      assert.ok(body instanceof FormData);
      assert.equal(config?.headers?.Authorization, 'Bearer test-api-key');
      assert.match(
        String(config?.headers?.['content-type']),
        /^multipart\/form-data; boundary=/,
      );

      const form = body as InspectableFormData;
      const multipartHeaders = form._streams
        .filter((part): part is string => typeof part === 'string')
        .join('\n');
      assert.match(multipartHeaders, /name="file"; filename="source.pdf"/);
      assert.match(multipartHeaders, /Content-Type: application\/pdf/);
      assert.doesNotMatch(multipartHeaders, /name="file_url"/);
      assert.ok(
        form._streams.some(
          (part) => typeof part === 'object' && part?.source === source,
        ),
      );
      if (submitCount === 1) throw createAxiosStatusError(502);

      return {
        data: {
          code: 200,
          message: 'success',
          data: { job_id: 'job-1' },
        },
      };
    },
  );
  mock.method(axios, 'get', async (url: string) => {
    if (url === 'https://results.textin.com/job-1') {
      resultCount += 1;
      if (resultCount === 1) throw createAxiosStatusError(502);
      return {
        data: {
          markdown: '# 标题\n\n正文',
        },
      };
    }
    statusCount += 1;
    assert.equal(url, 'https://api.textin.com/api/v1/xparse/parse/async/job-1');
    if (statusCount <= 3) throw createAxiosStatusError(502);
    return {
      data: {
        code: 200,
        message: 'success',
        data: {
          job_id: 'job-1',
          status: 'completed',
          result_url: 'https://results.textin.com/job-1',
        },
      },
    };
  });

  const input: DocumentParserInput = {
    file: {
      fileId: '00000000-0000-0000-0000-000000000001',
      filename: 'source.pdf',
      contentType: 'application/pdf',
      size: 14,
      openStream: async () => {
        source = Readable.from(['source-content']);
        return source;
      },
    },
    checkpoint: undefined,
    saveCheckpoint: async (checkpoint) => {
      checkpoints.push(checkpoint);
    },
    assertActive: async () => undefined,
  };

  try {
    const blocks = await remoteDocumentParser.parse(input);
    assert.equal(submitCount, 2);
    assert.equal(statusCount, 4);
    assert.equal(blocks.length, 2);
    assert.deepEqual(checkpoints, [
      {
        provider: 'textin-xparse',
        version: 1,
        jobId: 'job-1',
        status: 'pending',
      },
      {
        provider: 'textin-xparse',
        version: 1,
        jobId: 'job-1',
        status: 'completed',
        resultUrl: 'https://results.textin.com/job-1',
      },
    ]);
    await remoteDocumentParser.parse({
      ...input,
      checkpoint: checkpoints.at(-1),
    });
    assert.equal(submitCount, 2);
    assert.equal(statusCount, 4);
    assert.equal(resultCount, 3);
  } finally {
    mock.restoreAll();
    documentsConfig.document.textInBaseUrl = originalBaseUrl;
    documentsConfig.document.textInRequestRetryDelayMs = originalRetryDelay;
    documentsConfig.document.textInPollIntervalMs = originalPollInterval;
    if (originalTextIn) {
      ROOT.AI.textIn = originalTextIn;
    } else {
      delete ROOT.AI.textIn;
    }
  }
});
