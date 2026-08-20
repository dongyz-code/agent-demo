import type { LiteralUnion } from '@/types/index.js';
import type {
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const API_LOG_LABELS = ['textin'] as const;

/** 标记 */
export type Label = (typeof API_LOG_LABELS)[number];

/** 调用参数: 接口日志元数据 (包含日志记录) */
type ApiLogMetaWithLog = {
  ip: null | LiteralUnion<'localhost', string>;
  user_id: null | string;
  search_key: null | string;
};

/** 调用参数: 接口日志元数据 (不包含日志记录) */
type ApiLogMetaDisableLog = {
  /** 临时禁用日志记录 */
  disableLog: true;
};

/** 调用参数: 接口日志元数据 */
export type ApiLogMeta = ApiLogMetaWithLog | ApiLogMetaDisableLog;

/** 业务调用方传给出站请求的可查询标识，不含 label 与时间戳（由工厂补充）。 */
export interface ApiLogCallMeta {
  /** 发起方 IP，子进程等无 HTTP 上下文场景填 null。 */
  ip: null;
  /** 关联用户，无上下文时填 null。 */
  user_id: string | null;
  /** 快速检索键，建议用文档版本等稳定业务标识。 */
  search_key: string | null;
}

/** 完整记录参数: 接口日志元数据 */
export type ApiLogMetaWithLogFull = ApiLogMetaWithLog & {
  label: Label;
  start_timestamp: Date;
};

/** 添加接口发送日志参数 */
export type ApiSendLogParamsWithLog = {
  config?: InternalAxiosRequestConfig;
  response?: AxiosResponse;
  error?: unknown;
  meta: ApiLogMetaWithLogFull;
};

/** 添加接口发送日志参数（完整，同时包含日志记录和禁用日志记录） */
export type ApiSendLogParams = {
  config?: InternalAxiosRequestConfig;
  response?: AxiosResponse;
  error?: unknown;
  meta: ApiLogMetaWithLogFull | ApiLogMetaDisableLog;
};
