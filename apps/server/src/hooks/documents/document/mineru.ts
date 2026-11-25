import { strFromU8, unzipSync } from 'fflate';

import { createAxiosInstance } from '@/hooks/api-log/index.js';
import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { reTryFunc, sleep } from '@repo/utils-node';
import { documentsConfig } from '../config.js';

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiLogMeta } from '@/hooks/api-log/static.js';
import type { DocumentParserInput } from './types.js';

/** MinerU 申请上传和查询进度共用的响应。 */
interface MinerUBody {
  /** 0 表示请求成功。 */
  code: number;
  /** 当前接口的业务数据。 */
  data?: {
    /** 批量任务标识。 */
    batch_id?: string;
    /** 与请求文件顺序对应的上传地址。 */
    file_urls?: string[];
    /** 本批次每个文件的进度。 */
    extract_result?: {
      /** 任务状态。 */
      state?: string;
      /** 完成后的结果压缩包地址。 */
      full_zip_url?: string;
      /** 失败原因。 */
      err_msg?: string;
    }[];
  };
}

/** 一次解析里共用的 MinerU 请求。 */
interface MinerUHttp {
  /**
   * 发送一次请求，失败不重试。
   *
   * @param request 本次请求配置。
   * @returns 上游响应。
   */
  request<T>(request: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  /**
   * 发送一次请求，网络失败时按配置重试。
   *
   * @param request 本次请求配置。同一份配置会被重复发送，不能用来上传只能读一次的文件流。
   * @param label 失败重试时的日志名称。
   * @returns 上游响应。
   */
  send<T>(
    request: AxiosRequestConfig,
    label: string,
  ): Promise<AxiosResponse<T>>;
  /** 上传和查询的最大尝试次数。 */
  attempts: number;
  /** 两次尝试之间的等待。 */
  retryDelayMs: number;
  /** 上传大文件时覆盖通用超时。 */
  submitTimeoutMs: number;
  /** 两次查询之间的等待。 */
  pollIntervalMs: number;
  /** 本轮任务允许等待 MinerU 的截止时间。 */
  deadline: number;
}

/**
 * MinerU 文档解析客户端。
 *
 * 一次解析只做三件事：拿到可用的 batchId，等到结果包地址，再下载 Markdown。
 */
export class MinerUClient {
  /**
   * 把已验证文件解析成 Markdown。
   *
   * @param input 文件、恢复信息和存活检查。checkpoint 是已上传批次的 batchId。
   * @returns 结果包中的 full.md。
   */
  async markdown(input: DocumentParserInput): Promise<string> {
    const http = this.http(input);
    const batchId = await this.batchId(http, input);
    const zipUrl = await this.zipUrl(http, input, batchId);
    const zip = await this.download(http, input, zipUrl);
    return readFullMarkdown(zip);
  }

  /**
   * 按当前配置打开带 token 的请求。
   *
   * @param input 用来补齐出站日志标识。
   * @returns 本次解析共用的请求与等待参数。
   */
  private http(input: DocumentParserInput): MinerUHttp {
    const document = documentsConfig.document;
    const baseUrl = document.minerUBaseUrl;
    const token = ROOT.AI?.minerU?.token?.trim();
    if (!baseUrl) {
      throw new ROOT_ERROR('AI.minerU.baseUrl 未配置');
    }
    if (!token) {
      throw new ROOT_ERROR('AI.minerU.token 未配置');
    }
    const api = createAxiosInstance({
      label: 'mineru',
      config: {
        baseURL: baseUrl,
        headers: { Authorization: `Bearer ${token}` },
        timeout: document.minerURequestTimeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    });
    const meta: ApiLogMeta = input.logMeta ?? {
      ip: null,
      user_id: null,
      search_key: null,
    };
    return {
      attempts: document.minerURequestMaxAttempts,
      retryDelayMs: document.minerURequestRetryDelayMs,
      submitTimeoutMs: document.minerUSubmitTimeoutMs,
      pollIntervalMs: document.minerUPollIntervalMs,
      deadline: Date.now() + document.minerUMaxWaitMs,
      request<T>(request: AxiosRequestConfig) {
        return api<T>(request, meta);
      },
      send<T>(request: AxiosRequestConfig, label: string) {
        const attempt = reTryFunc(() => api<T>(request, meta), {
          count: document.minerURequestMaxAttempts,
          duration: document.minerURequestRetryDelayMs,
          label,
        });
        return attempt();
      },
    };
  }

  /**
   * 沿用已落库的批次，否则上传文件并在成功后写入 batchId。
   *
   * 写入发生在上传成功之后。更早宕机就重新上传，避免下次去等一个还没收到文件的批次。
   *
   * @param http 本次解析的请求。
   * @param input 文件与恢复信息。
   * @returns 可以轮询的 batchId。
   */
  private async batchId(
    http: MinerUHttp,
    input: DocumentParserInput,
  ): Promise<string> {
    if (typeof input.checkpoint === 'string' && input.checkpoint) {
      return input.checkpoint;
    }
    await input.assertActive();
    const applied = await http.send<MinerUBody>(
      {
        url: 'api/v4/file-urls/batch',
        method: 'post',
        data: {
          files: [{ name: input.file.filename }],
          model_version: 'vlm',
        },
      },
      'MinerU 申请上传地址',
    );
    const upload = applied.data.data;
    if (applied.data.code !== 0 || !upload?.batch_id) {
      throw new ROOT_ERROR('MinerU 未返回有效 batch_id');
    }
    const fileUrl = upload.file_urls?.[0];
    if (!fileUrl) {
      throw new ROOT_ERROR('MinerU 未返回上传地址');
    }
    const batchId = upload.batch_id;
    const put = reTryFunc(
      async () => {
        await input.assertActive();
        const source = await input.file.openStream();
        try {
          await http.request({
            url: fileUrl,
            method: 'put',
            data: source,
            headers: {
              Authorization: null,
              // 预签名按空 Content-Type 计算。axios 会给 PUT 补上
              // application/x-www-form-urlencoded，OSS 会回 403。
              'Content-Type': '',
              'Content-Length': String(input.file.size),
            },
            maxBodyLength: Infinity,
            timeout: http.submitTimeoutMs,
          });
        } catch (error) {
          source.destroy();
          throw error;
        }
      },
      {
        count: http.attempts,
        duration: http.retryDelayMs,
        label: 'MinerU 上传文件',
      },
    );
    await put();
    await input.saveCheckpoint(batchId);
    return batchId;
  }

  /**
   * 轮询批次，直到 MinerU 给出结果包地址。
   *
   * @param http 本次解析的请求。
   * @param input 存活检查。
   * @param batchId 已上传的批次。
   * @returns 当次查询返回的结果包地址，过期后需要重新查询。
   */
  private async zipUrl(
    http: MinerUHttp,
    input: DocumentParserInput,
    batchId: string,
  ): Promise<string> {
    while (Date.now() < http.deadline) {
      await input.assertActive();
      const response = await http.send<MinerUBody>(
        {
          url: `api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
          method: 'get',
        },
        'MinerU 查询解析结果',
      );
      const body = response.data;
      const data = body.data;
      if (body.code !== 0 || data?.batch_id !== batchId) {
        throw new ROOT_ERROR('MinerU 状态响应 batch_id 不匹配');
      }
      const item = data.extract_result?.[0];
      if (item?.state === 'failed') {
        throw new ROOT_ERROR('MinerU 异步解析任务失败', {
          batch_id: batchId,
          err_msg: item.err_msg,
        });
      }
      if (item?.state === 'done') {
        if (!item.full_zip_url) {
          throw new ROOT_ERROR('MinerU 完成任务未返回结果地址');
        }
        return item.full_zip_url;
      }
      const pending =
        !item ||
        item.state === 'waiting-file' ||
        item.state === 'pending' ||
        item.state === 'running' ||
        item.state === 'converting';
      if (!pending) {
        throw new ROOT_ERROR('MinerU 返回了未知任务状态');
      }
      await sleep(http.pollIntervalMs);
    }
    throw new ROOT_ERROR('MinerU 异步解析等待超时', { batch_id: batchId });
  }

  /**
   * 下载结果包。签名地址不能带 MinerU token。
   *
   * @param http 本次解析的请求。
   * @param input 存活检查。
   * @param url 当次查询返回的结果包地址。
   * @returns 压缩包字节。
   */
  private async download(
    http: MinerUHttp,
    input: DocumentParserInput,
    url: string,
  ): Promise<Uint8Array> {
    await input.assertActive();
    const response = await http.send<ArrayBuffer>(
      {
        url,
        method: 'get',
        responseType: 'arraybuffer',
        headers: { Authorization: null },
      },
      'MinerU 下载解析结果',
    );
    return new Uint8Array(response.data);
  }
}

/** 进程内共用的 MinerU 客户端。 */
export const minerU = new MinerUClient();

/**
 * 从 MinerU 结果包中读取 full.md。
 *
 * @param zip 结果压缩包。
 * @returns Markdown 文本。
 */
function readFullMarkdown(zip: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter(file) {
        const name = file.name.replaceAll('\\', '/');
        return name === 'full.md' || name.endsWith('/full.md');
      },
    });
  } catch {
    throw new ROOT_ERROR('MinerU 未返回 Markdown 内容');
  }
  const entry = Object.entries(files).find(([name]) => {
    const normalized = name.replaceAll('\\', '/');
    return normalized === 'full.md' || normalized.endsWith('/full.md');
  });
  if (!entry) {
    throw new ROOT_ERROR('MinerU 未返回 Markdown 内容');
  }
  return strFromU8(entry[1]);
}
