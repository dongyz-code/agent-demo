import { ROOT } from '@/configs/index.js';

/**
 * documents 域在 conf.json 中的配置切片。
 *
 * `ROOT` 仅保证基础设施连接（pg/storage/AI）的契约，域配置切片由域自管：按 conf.json
 * 约定从 `ROOT` 读取剩余可配置项（外部服务地址与迁移期回滚开关），其余调参为安全默认常量。
 */
interface DocumentsConf {
  upload?: { officePreviewEndpoint?: string };
  document?: { parserEndpoint?: string };
  fileProcessing?: { enabled?: boolean };
}

const conf = ROOT as DocumentsConf;

/** 去尾斜杠归一化 endpoint：外部解析/预览请求依赖 Host/Path 一致。 */
function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * documents 域运行期配置。
 *
 * 调参为安全默认常量（原 conf.json 覆盖能力已移除）；仅外部服务地址
 * `officePreviewEndpoint`/`parserEndpoint` 与迁移期回滚开关 `fileProcessing.enabled`
 * 仍读 conf.json，未配置时安全降级。消费方直接读 `documentsConfig.upload.xxx` 等。
 */
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
    officePreviewEndpoint: conf.upload?.officePreviewEndpoint
      ? normalizeEndpoint(conf.upload.officePreviewEndpoint)
      : undefined,
  },
  document: {
    parserEndpoint: conf.document?.parserEndpoint
      ? normalizeEndpoint(conf.document.parserEndpoint)
      : undefined,
    parserTimeoutMs: 2 * 60 * 1000,
    segmentSizeTokens: 600,
    segmentOverlapTokens: 80,
  },
  fileProcessing: {
    defaultEnterRag: true,
    workerConcurrency: 4,
    staleTaskSeconds: 5 * 60,
    enabled: conf.fileProcessing?.enabled ?? true,
  },
};
