import { ROOT } from './env.js';

/** 文件处理任务运行配置。 */
export interface FileProcessingRuntimeConfig {
  /** 文件管理上传时是否默认进入 RAG 接入流程。 */
  defaultEnterRag: boolean;
  /** 单个服务实例允许同时领取的文件处理任务数。 */
  workerConcurrency: number;
  /** 执行中任务超过该秒数未更新时视为失去心跳。 */
  staleTaskSeconds: number;
  /** 是否启用新的文件处理任务入口，关闭时保留旧流程用于回滚。 */
  enabled: boolean;
}

let runtimeConfig: FileProcessingRuntimeConfig | undefined;

/**
 * 读取并校验文件处理任务配置。
 *
 * @returns 已填充安全默认值的运行配置。
 */
export function getFileProcessingRuntimeConfig(): FileProcessingRuntimeConfig {
  if (runtimeConfig) return runtimeConfig;

  const config = ROOT.fileProcessing ?? {};
  runtimeConfig = {
    defaultEnterRag: config.defaultEnterRag ?? true,
    workerConcurrency: positiveInteger(
      config.workerConcurrency ?? 4,
      'fileProcessing.workerConcurrency',
    ),
    staleTaskSeconds: positiveInteger(
      config.staleTaskSeconds ?? 5 * 60,
      'fileProcessing.staleTaskSeconds',
    ),
    enabled: config.enabled ?? true,
  };
  return runtimeConfig;
}

/** 启动时校验文件处理任务配置。 */
export function validateFileProcessingRuntimeConfig(): void {
  getFileProcessingRuntimeConfig();
}

/** 校验必须为正整数的配置项。 */
function positiveInteger(value: number, key: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`系统配置: ${key} 必须为正整数`);
  }
  return value;
}

