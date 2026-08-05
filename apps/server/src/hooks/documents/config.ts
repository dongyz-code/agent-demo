/**
 * documents 域运行期配置。
 *
 * 域内调参使用直接常量；TextIn 等外部服务地址从根配置读取，避免部署地址进入源码。
 */

import { ROOT } from '@/configs/env.js';

/** 去尾斜杠归一化 endpoint：外部解析/预览请求依赖 Host/Path 一致。 */
function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** Office 预览服务地址；留空则预览按缺失处理。 */
const OFFICE_PREVIEW_ENDPOINT: string = '';
/** 文件处理总开关。 */
const FILE_PROCESSING_ENABLED = true;

export const documentsConfig = {
  upload: {
    presignExpiresSeconds: 20 * 60,
    multipartThresholdBytes: 50 * 1024 * 1024,
    partSizeBytes: 16 * 1024 * 1024,
    maxFileSizeBytes: 200 * 1024 * 1024,
    sessionExpiresSeconds: 24 * 60 * 60,
    maxTextPreviewBytes: 1024 * 1024,
    officePreviewEndpoint: OFFICE_PREVIEW_ENDPOINT
      ? normalizeEndpoint(OFFICE_PREVIEW_ENDPOINT)
      : undefined,
  },
  document: {
    /** TextIn xParse API 根地址，不包含具体接口路径。 */
    textInBaseUrl: ROOT.AI?.textIn?.baseUrl
      ? normalizeEndpoint(ROOT.AI.textIn.baseUrl)
      : undefined,
    /** TextIn 提交、查询或结果下载单次 HTTP 请求超时。 */
    textInRequestTimeoutMs: 60 * 1000,
    /** TextIn 异步任务状态轮询间隔。 */
    textInPollIntervalMs: 5 * 1000,
    /** 单次后台任务等待 TextIn 完成的最长时间。 */
    textInMaxWaitMs: 60 * 60 * 1000,
    /** TextIn 拉取私有源文件时使用的签名地址有效期。 */
    textInSourceUrlExpiresSeconds: 60 * 60,
    /** Office 预览转换 Worker 的单次请求超时。 */
    officePreviewTimeoutMs: 2 * 60 * 1000,
    segmentSizeTokens: 600,
    segmentOverlapTokens: 80,
  },
  fileProcessing: {
    workerConcurrency: 4,
    staleTaskSeconds: 5 * 60,
    enabled: FILE_PROCESSING_ENABLED,
  },
};
