import { ROOT } from './env.js';

/** 文档处理阶段使用的完整配置。 */
export interface DocumentRuntimeConfig {
  /** 外部 PDF/Office 解析服务地址。 */
  parserEndpoint?: string;
  /** 外部解析超时毫秒数。 */
  parserTimeoutMs: number;
  /** 默认 Segment 目标 token 数。 */
  segmentSizeTokens: number;
  /** 相邻 Segment 重叠 token 数。 */
  segmentOverlapTokens: number;
}

/** 读取并校验文档处理运行配置。 */
export function getDocumentRuntimeConfig(): DocumentRuntimeConfig {
  const config = ROOT.document ?? {};
  const segmentSizeTokens = positiveInteger(
    config.segmentSizeTokens ?? 600,
    'document.segmentSizeTokens',
  );
  const segmentOverlapTokens = nonNegativeInteger(
    config.segmentOverlapTokens ?? 80,
    'document.segmentOverlapTokens',
  );
  if (segmentOverlapTokens >= segmentSizeTokens) {
    throw new Error(
      '系统配置: document.segmentOverlapTokens 必须小于 segmentSizeTokens',
    );
  }
  return {
    parserEndpoint: config.parserEndpoint
      ? normalizeEndpoint(config.parserEndpoint)
      : undefined,
    parserTimeoutMs: positiveInteger(
      config.parserTimeoutMs ?? 2 * 60 * 1000,
      'document.parserTimeoutMs',
    ),
    segmentSizeTokens,
    segmentOverlapTokens,
  };
}

/** 校验正整数配置。 */
function positiveInteger(value: number, key: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`系统配置: ${key} 必须为正整数`);
  }
  return value;
}

/** 校验非负整数配置。 */
function nonNegativeInteger(value: number, key: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`系统配置: ${key} 必须为非负整数`);
  }
  return value;
}

/** 校验外部解析服务 Endpoint。 */
function normalizeEndpoint(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('系统配置: document.parserEndpoint 仅支持 HTTP/HTTPS');
  }
  return url.toString().replace(/\/+$/, '');
}
