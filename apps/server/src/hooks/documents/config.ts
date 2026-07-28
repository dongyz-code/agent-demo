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
    maxFileSizeBytes: 2 * 1024 * 1024 * 1024,
    maxSignedParts: 20,
    sessionExpiresSeconds: 24 * 60 * 60,
    unboundRetentionDays: 7,
    maxTextPreviewBytes: 1024 * 1024,
    officePreviewEndpoint: OFFICE_PREVIEW_ENDPOINT
      ? normalizeEndpoint(OFFICE_PREVIEW_ENDPOINT)
      : undefined,
  },
  document: {
    parserEndpoint: ROOT.AI?.textIn?.baseUrl
      ? normalizeEndpoint(ROOT.AI.textIn.baseUrl)
      : undefined,
    parserTimeoutMs: 2 * 60 * 1000,
    segmentSizeTokens: 600,
    segmentOverlapTokens: 80,
  },
  fileProcessing: {
    defaultEnterRag: false,
    workerConcurrency: 4,
    staleTaskSeconds: 5 * 60,
    enabled: FILE_PROCESSING_ENABLED,
  },
};
