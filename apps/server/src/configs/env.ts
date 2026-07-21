import { getSysConf, loadEnv } from '@repo/configs';
import { configFile } from './dirs.js';

import type { ConfExtra } from '@/types/index.js';

const { APP_PROD } = loadEnv();

const RAW = getSysConf<ConfExtra>(
  APP_PROD
    ? {
        /** 线上环境使用一份配置文件 */
        force: configFile,
      }
    : {
        add: configFile,
      },
);

/** 去尾斜杠归一化 endpoint：S3 签名与外部解析请求依赖 Host/Path 一致。 */
function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

const s3 = RAW.storage.s3;
const uploadConf = RAW.upload ?? {};
const documentConf = RAW.document ?? {};
const fileProcessingConf = RAW.fileProcessing ?? {};

/**
 * 运行期根配置。
 *
 * 在加载时一次性把 upload/document/fileProcessing 填好默认值、归一化 endpoint，
 * 消费方直接读 `ROOT.upload.xxx` 等，不再各自兜底或重复逐字段校验。默认值集中在此，
 * conf.json 未填字段走安全默认；值非法交由使用处自然暴露。
 */
export const ROOT = {
  ...RAW,
  upload: {
    internalEndpoint: normalizeEndpoint(s3.internalEndpoint),
    publicEndpoint: normalizeEndpoint(s3.publicEndpoint),
    region: s3.region?.trim() || 'us-east-1',
    accessKey: s3.accessKey,
    secretKey: s3.secretKey,
    bucket: s3.bucket,
    presignExpiresSeconds: uploadConf.presignExpiresSeconds ?? 20 * 60,
    multipartThresholdBytes:
      uploadConf.multipartThresholdBytes ?? 50 * 1024 * 1024,
    partSizeBytes: uploadConf.partSizeBytes ?? 16 * 1024 * 1024,
    maxFileSizeBytes: uploadConf.maxFileSizeBytes ?? 2 * 1024 * 1024 * 1024,
    maxSignedParts: uploadConf.maxSignedParts ?? 20,
    sessionExpiresSeconds: uploadConf.sessionExpiresSeconds ?? 24 * 60 * 60,
    unboundRetentionDays: uploadConf.unboundRetentionDays ?? 7,
    maxTextPreviewBytes: uploadConf.maxTextPreviewBytes ?? 1024 * 1024,
    officePreviewEndpoint: uploadConf.officePreviewEndpoint
      ? normalizeEndpoint(uploadConf.officePreviewEndpoint)
      : undefined,
  },
  document: {
    parserEndpoint: documentConf.parserEndpoint
      ? normalizeEndpoint(documentConf.parserEndpoint)
      : undefined,
    parserTimeoutMs: documentConf.parserTimeoutMs ?? 2 * 60 * 1000,
    segmentSizeTokens: documentConf.segmentSizeTokens ?? 600,
    segmentOverlapTokens: documentConf.segmentOverlapTokens ?? 80,
  },
  fileProcessing: {
    defaultEnterRag: fileProcessingConf.defaultEnterRag ?? true,
    workerConcurrency: fileProcessingConf.workerConcurrency ?? 4,
    staleTaskSeconds: fileProcessingConf.staleTaskSeconds ?? 5 * 60,
    enabled: fileProcessingConf.enabled ?? true,
  },
};
