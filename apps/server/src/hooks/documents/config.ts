/**
 * documents 域运行期配置。
 *
 * 域内调参使用直接常量；MinerU 等外部服务地址从根配置读取，避免部署地址进入源码。
 */

import { ROOT } from '@/configs/env.js';

/** 文件处理总开关。 */
const FILE_PROCESSING_ENABLED = true;

export const documentsConfig = {
  preview: {
    /** 转换器允许读取的源文件上限，独立于上传传输配置。 */
    maxSourceBytes: 200 * 1024 * 1024,
    /** 文本预览只读取有限内容，避免生成无界页面。 */
    maxTextPreviewBytes: 1024 * 1024,
  },
  document: {
    /** MinerU API 根地址，不包含具体接口路径。 */
    minerUBaseUrl: ROOT.AI?.minerU?.baseUrl,
    /** MinerU 查询或结果下载单次 HTTP 请求超时。 */
    minerURequestTimeoutMs: 60 * 1000,
    /** MinerU 提交上传的单次 HTTP 请求超时，大文件需要更长，覆盖通用超时。 */
    minerUSubmitTimeoutMs: 10 * 60 * 1000,
    /** MinerU 瞬时网络故障的单次调用最大尝试次数。 */
    minerURequestMaxAttempts: 3,
    /** MinerU 瞬时网络故障首次重试前的等待时间。 */
    minerURequestRetryDelayMs: 1000,
    /** MinerU 异步任务状态轮询间隔。 */
    minerUPollIntervalMs: 5 * 1000,
    /** 单次后台任务等待 MinerU 完成的最长时间。 */
    minerUMaxWaitMs: 60 * 60 * 1000,
    /** 本地 soffice 把 Office 文件转 PDF 的单次转换超时。 */
    officePreviewTimeoutMs: 2 * 60 * 1000,
    segmentSizeTokens: 600,
    segmentOverlapTokens: 80,
  },
  fileProcessing: {
    enabled: FILE_PROCESSING_ENABLED,
    /** 汇总文档任务的跨实例并发，内容、预览和清理共同占用。 */
    concurrency: 2,
    /** 汇总文档任务首次执行之外允许的最大自动重试次数。 */
    maxRetries: 3,
    /** 汇总文档任务的固定重试间隔。 */
    retryDelayMs: 5_000,
    /** 汇总文档任务单次执行的总超时。 */
    timeoutMs: 2 * 60 * 60 * 1000,
  },
};
