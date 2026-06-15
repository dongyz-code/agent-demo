import type { LiteralUnion } from '@/types/index.js';
import type {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const API_LOG_LABELS = [] as const;

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

/** 完整记录参数: 接口日志元数据 */
export type ApiLogMetaWithLogFull = ApiLogMetaWithLog & {
  label: Label;
  start_timestamp: Date;
};

/** 添加接口发送日志参数 */
export type ApiSendLogParamsWithLog = {
  config?: InternalAxiosRequestConfig;
  response?: AxiosResponse;
  error?: AxiosError;
  meta: ApiLogMetaWithLogFull;
};

/** 添加接口发送日志参数（完整，同时包含日志记录和禁用日志记录） */
export type ApiSendLogParams = {
  config?: InternalAxiosRequestConfig;
  response?: AxiosResponse;
  error?: AxiosError;
  meta: ApiLogMetaWithLogFull | ApiLogMetaDisableLog;
};
