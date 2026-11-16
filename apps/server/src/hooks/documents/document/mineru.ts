import { strFromU8, unzipSync } from 'fflate';

import { createAxiosInstance } from '@/hooks/api-log/index.js';
import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { reTryFunc, sleep } from '@repo/utils-node';
import { documentsConfig } from '../config.js';

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

/**
 * MinerU 文档解析客户端。
 *
 * 使用配置里的 token 调用精准解析接口，上传文件后轮询批量任务，再从结果包读取 Markdown。
 */
export class MinerUClient {
  /**
   * 把已验证文件解析成 Markdown。
   *
   * checkpoint 是上次上传得到的 batchId。有这个值时接着查询，不再重新上传。
   *
   * @param input 文件、恢复信息和存活检查。
   * @returns 结果包中的 full.md。
   */
  async markdown(input: DocumentParserInput): Promise<string> {
    const config = documentsConfig.document;
    const baseUrl = config.minerUBaseUrl;
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
        timeout: config.minerURequestTimeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    });
    const meta = input.logMeta ?? {
      ip: null,
      user_id: null,
      search_key: null,
    };
    const retryOptions = {
      count: config.minerURequestMaxAttempts,
      duration: config.minerURequestRetryDelayMs,
    };

    let batchId = '';
    if (typeof input.checkpoint === 'string') {
      batchId = input.checkpoint;
    }
    if (!batchId) {
      const submit = reTryFunc(
        async () => {
          await input.assertActive();
          const applied = await api<MinerUBody>(
            {
              url: 'api/v4/file-urls/batch',
              method: 'post',
              data: {
                files: [{ name: input.file.filename }],
                model_version: 'vlm',
              },
            },
            meta,
          );
          const upload = applied.data.data;
          if (applied.data.code !== 0 || !upload?.batch_id) {
            throw new ROOT_ERROR('MinerU 未返回有效 batch_id');
          }
          const fileUrl = upload.file_urls?.[0];
          if (!fileUrl) {
            throw new ROOT_ERROR('MinerU 未返回上传地址');
          }
          const source = await input.file.openStream();
          try {
            await api(
              {
                url: fileUrl,
                method: 'put',
                data: source,
                headers: {
                  Authorization: null,
                  'Content-Length': String(input.file.size),
                },
                maxBodyLength: Infinity,
                timeout: config.minerUSubmitTimeoutMs,
              },
              meta,
            );
          } catch (error) {
            source.destroy();
            throw error;
          }
          return upload.batch_id;
        },
        { ...retryOptions, label: 'MinerU 创建异步解析任务' },
      );
      batchId = await submit();
      await input.saveCheckpoint(batchId);
    }

    let resultUrl = '';
    const deadline = Date.now() + config.minerUMaxWaitMs;
    while (!resultUrl) {
      if (Date.now() >= deadline) {
        throw new ROOT_ERROR('MinerU 异步解析等待超时', { batch_id: batchId });
      }
      await input.assertActive();
      const query = reTryFunc(
        () =>
          api<MinerUBody>(
            {
              url: `api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
              method: 'get',
            },
            meta,
          ),
        { ...retryOptions, label: 'MinerU 查询异步解析任务' },
      );
      const response = (await query()).data;
      const data = response.data;
      if (response.code !== 0 || data?.batch_id !== batchId) {
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
        resultUrl = item.full_zip_url;
        break;
      }
      const waiting =
        !item ||
        item.state === 'waiting-file' ||
        item.state === 'pending' ||
        item.state === 'running' ||
        item.state === 'converting';
      if (!waiting) {
        throw new ROOT_ERROR('MinerU 返回了未知任务状态');
      }
      await sleep(config.minerUPollIntervalMs);
    }

    await input.assertActive();
    const download = reTryFunc(
      () =>
        api<ArrayBuffer>(
          {
            url: resultUrl,
            method: 'get',
            responseType: 'arraybuffer',
            headers: { Authorization: null },
          },
          meta,
        ),
      { ...retryOptions, label: 'MinerU 下载解析结果' },
    );
    return readFullMarkdown(new Uint8Array((await download()).data));
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
